package main

import (
	"archive/zip"
	"bytes"
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

type config struct {
	ServiceAccountFile string
	DriveFileID        string
	DriveFolderID      string
	DriveNameContains  string
	DownloadDir        string
	ExtractDir         string
	DBDestPath         string
	DBFileName         string
	ExporterCommand    string
	FrontendDataPath   string
	DistDataPath       string
	StateFile          string
	Cleanup            bool
}

type driveSyncState struct {
	FileID       string `json:"file_id"`
	ModifiedTime string `json:"modified_time"`
	SyncedAt     string `json:"synced_at"`
}

type serviceAccountKey struct {
	ClientEmail string `json:"client_email"`
	PrivateKey  string `json:"private_key"`
	TokenURI    string `json:"token_uri"`
}

type driveListResponse struct {
	Files []driveFile `json:"files"`
}

type driveFile struct {
	ID           string `json:"id"`
	Name         string `json:"name"`
	ModifiedTime string `json:"modifiedTime"`
	MimeType     string `json:"mimeType"`
}

type tokenResponse struct {
	AccessToken string `json:"access_token"`
	TokenType   string `json:"token_type"`
}

type candidateDB struct {
	path  string
	score int
	size  int64
}

func main() {
	log.SetFlags(log.LstdFlags | log.Lmsgprefix)
	log.SetPrefix("[health-connect-sync] ")

	cfg, err := loadConfig()
	if err != nil {
		log.Fatalf("config error: %v", err)
	}

	sa, err := loadServiceAccount(cfg.ServiceAccountFile)
	if err != nil {
		log.Fatalf("failed to load service account: %v", err)
	}

	token, err := fetchAccessToken(sa)
	if err != nil {
		log.Fatalf("failed to fetch Google access token: %v", err)
	}

	driveFile, err := resolveDriveFile(token, cfg)
	if err != nil {
		log.Fatalf("failed to resolve Drive backup file: %v", err)
	}

	// Check if local DB already exists and Drive file is unmodified
	skipDriveDownload := false
	if driveFile.ModifiedTime != "" {
		if dbInfo, err := os.Stat(cfg.DBDestPath); err == nil && dbInfo.Size() > 0 {
			state, err := loadDriveSyncState(cfg.StateFile)
			if err == nil && state.FileID == driveFile.ID && state.ModifiedTime == driveFile.ModifiedTime {
				log.Printf("Drive backup unmodified (modifiedTime: %s). Skipping download & extraction, using existing %s",
					driveFile.ModifiedTime, cfg.DBDestPath)
				skipDriveDownload = true
			}
		}
	}

	downloadName := driveFile.Name
	if strings.TrimSpace(downloadName) == "" {
		downloadName = "health-connect-backup.zip"
	}
	downloadPath := filepath.Join(cfg.DownloadDir, sanitizeFileName(downloadName))

	if !skipDriveDownload {
		if err := os.MkdirAll(cfg.DownloadDir, 0755); err != nil {
			log.Fatalf("failed to create download dir: %v", err)
		}
		if err := os.RemoveAll(cfg.ExtractDir); err != nil {
			log.Fatalf("failed to clear extract dir: %v", err)
		}
		if err := os.MkdirAll(cfg.ExtractDir, 0755); err != nil {
			log.Fatalf("failed to create extract dir: %v", err)
		}

		log.Printf("downloading Drive backup %q (modified: %s)...", driveFile.Name, driveFile.ModifiedTime)
		if err := downloadDriveFile(token, driveFile.ID, downloadPath); err != nil {
			if _, statErr := os.Stat(cfg.DBDestPath); statErr == nil {
				log.Printf("warning: Drive download failed (%v). Falling back to existing local %s", err, cfg.DBDestPath)
				skipDriveDownload = true
			} else {
				log.Fatalf("failed to download backup: %v", err)
			}
		} else {
			log.Printf("extracting %s...", downloadPath)
			if err := unzip(downloadPath, cfg.ExtractDir); err != nil {
				if _, statErr := os.Stat(cfg.DBDestPath); statErr == nil {
					log.Printf("warning: failed to extract backup (%v). Falling back to existing local %s", err, cfg.DBDestPath)
					skipDriveDownload = true
				} else {
					log.Fatalf("failed to extract backup: %v", err)
				}
			} else {
				dbSourcePath, err := findDatabaseFile(cfg.ExtractDir, cfg.DBFileName)
				if err != nil {
					if _, statErr := os.Stat(cfg.DBDestPath); statErr == nil {
						log.Printf("warning: database not found in backup (%v). Falling back to existing local %s", err, cfg.DBDestPath)
						skipDriveDownload = true
					} else {
						log.Fatalf("failed to locate Health Connect database in extracted backup: %v", err)
					}
				} else {
					log.Printf("copying database %s -> %s", dbSourcePath, cfg.DBDestPath)
					if err := copyFile(dbSourcePath, cfg.DBDestPath); err != nil {
						log.Fatalf("failed to place Health Connect DB: %v", err)
					}

					_ = saveDriveSyncState(cfg.StateFile, &driveSyncState{
						FileID:       driveFile.ID,
						ModifiedTime: driveFile.ModifiedTime,
						SyncedAt:     time.Now().UTC().Format(time.RFC3339),
					})
				}
			}
		}

		if cfg.Cleanup {
			_ = os.Remove(downloadPath)
			_ = os.RemoveAll(cfg.ExtractDir)
		}
	}

	driveStatus := "updated"
	if skipDriveDownload {
		driveStatus = "cached"
	}
	_ = os.Setenv("WI_DRIVE_STATUS", driveStatus)

	log.Printf("running exporter command: %s (Drive status: %s)", cfg.ExporterCommand, driveStatus)
	if err := runCommand(cfg.ExporterCommand); err != nil {
		log.Fatalf("exporter command failed: %v", err)
	}

	if cfg.FrontendDataPath != "" && cfg.DistDataPath != "" {
		if _, err := os.Stat(cfg.FrontendDataPath); err == nil {
			if err := copyFile(cfg.FrontendDataPath, cfg.DistDataPath); err != nil {
				log.Printf("warning: failed to mirror data.json to dist: %v", err)
			} else {
				log.Printf("mirrored %s -> %s", cfg.FrontendDataPath, cfg.DistDataPath)
			}
		}
	}

	log.Printf("sync completed successfully")
}

func loadConfig() (*config, error) {
	cfg := &config{
		ServiceAccountFile: envOrDefault("WI_GDRIVE_SERVICE_ACCOUNT_FILE", "./service-account.json"),
		DriveFileID:        strings.TrimSpace(os.Getenv("WI_GDRIVE_FILE_ID")),
		DriveFolderID:      strings.TrimSpace(os.Getenv("WI_GDRIVE_FOLDER_ID")),
		DriveNameContains:  strings.TrimSpace(os.Getenv("WI_GDRIVE_NAME_CONTAINS")),
		DownloadDir:        envOrDefault("WI_SYNC_DOWNLOAD_DIR", "./.sync-cache/download"),
		ExtractDir:         envOrDefault("WI_SYNC_EXTRACT_DIR", "./.sync-cache/extracted"),
		DBDestPath:         envOrDefault("WI_HEALTH_DB_DEST", "./health_connect_export.db"),
		DBFileName:         envOrDefault("WI_HEALTH_DB_FILENAME", "health_connect_export.db"),
		ExporterCommand:    envOrDefault("WI_EXPORTER_COMMAND", "go run ./data_exporter.go"),
		FrontendDataPath:   envOrDefault("WI_FRONTEND_DATA_JSON", "../frontend/data.json"),
		DistDataPath:       envOrDefault("WI_DIST_DATA_JSON", "../frontend/dist/data.json"),
		StateFile:          envOrDefault("WI_SYNC_STATE_FILE", "./.sync-cache/drive_state.json"),
		Cleanup:            envBoolOrDefault("WI_SYNC_CLEANUP", true),
	}

	if cfg.DriveFileID == "" && cfg.DriveFolderID == "" {
		return nil, errors.New("set WI_GDRIVE_FILE_ID or WI_GDRIVE_FOLDER_ID")
	}
	if cfg.ServiceAccountFile == "" {
		return nil, errors.New("WI_GDRIVE_SERVICE_ACCOUNT_FILE is required")
	}
	return cfg, nil
}

func envOrDefault(key, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(key)); value != "" {
		return value
	}
	return fallback
}

func envBoolOrDefault(key string, fallback bool) bool {
	value := strings.TrimSpace(strings.ToLower(os.Getenv(key)))
	if value == "" {
		return fallback
	}
	return value == "1" || value == "true" || value == "yes" || value == "on"
}

func loadServiceAccount(path string) (*serviceAccountKey, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var sa serviceAccountKey
	if err := json.Unmarshal(data, &sa); err != nil {
		return nil, err
	}
	if sa.ClientEmail == "" || sa.PrivateKey == "" {
		return nil, errors.New("service account JSON is missing client_email or private_key")
	}
	if sa.TokenURI == "" {
		sa.TokenURI = "https://oauth2.googleapis.com/token"
	}
	return &sa, nil
}

func fetchAccessToken(sa *serviceAccountKey) (string, error) {
	privateKey, err := parsePrivateKey(sa.PrivateKey)
	if err != nil {
		return "", err
	}

	now := time.Now().UTC()
	header := `{"alg":"RS256","typ":"JWT"}`
	claimsBytes, err := json.Marshal(map[string]any{
		"iss":   sa.ClientEmail,
		"scope": "https://www.googleapis.com/auth/drive.readonly",
		"aud":   sa.TokenURI,
		"iat":   now.Unix(),
		"exp":   now.Add(time.Hour).Unix(),
	})
	if err != nil {
		return "", err
	}

	unsigned := base64.RawURLEncoding.EncodeToString([]byte(header)) + "." +
		base64.RawURLEncoding.EncodeToString(claimsBytes)

	hash := sha256.Sum256([]byte(unsigned))
	signature, err := rsa.SignPKCS1v15(rand.Reader, privateKey, crypto.SHA256, hash[:])
	if err != nil {
		return "", err
	}

	assertion := unsigned + "." + base64.RawURLEncoding.EncodeToString(signature)
	form := url.Values{}
	form.Set("grant_type", "urn:ietf:params:oauth:grant-type:jwt-bearer")
	form.Set("assertion", assertion)

	resp, err := http.PostForm(sa.TokenURI, form)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("token endpoint returned %d: %s", resp.StatusCode, string(body))
	}

	var token tokenResponse
	if err := json.Unmarshal(body, &token); err != nil {
		return "", err
	}
	if token.AccessToken == "" {
		return "", errors.New("token endpoint returned empty access_token")
	}
	return token.AccessToken, nil
}

func parsePrivateKey(pemString string) (*rsa.PrivateKey, error) {
	block, _ := pem.Decode([]byte(pemString))
	if block == nil {
		return nil, errors.New("failed to decode PEM private key")
	}

	if key, err := x509.ParsePKCS8PrivateKey(block.Bytes); err == nil {
		rsaKey, ok := key.(*rsa.PrivateKey)
		if !ok {
			return nil, errors.New("private key is not RSA")
		}
		return rsaKey, nil
	}

	key, err := x509.ParsePKCS1PrivateKey(block.Bytes)
	if err != nil {
		return nil, err
	}
	return key, nil
}

func resolveDriveFile(token string, cfg *config) (*driveFile, error) {
	if cfg.DriveFileID != "" {
		req, err := http.NewRequest(
			http.MethodGet,
			fmt.Sprintf("https://www.googleapis.com/drive/v3/files/%s?fields=id,name,modifiedTime,mimeType&supportsAllDrives=true", url.PathEscape(cfg.DriveFileID)),
			nil,
		)
		if err == nil {
			req.Header.Set("Authorization", "Bearer "+token)
			if resp, err := http.DefaultClient.Do(req); err == nil {
				defer resp.Body.Close()
				if resp.StatusCode == http.StatusOK {
					var f driveFile
					if err := json.NewDecoder(resp.Body).Decode(&f); err == nil && f.ID != "" {
						if f.Name == "" {
							f.Name = "health-connect-backup.zip"
						}
						return &f, nil
					}
				}
			}
		}
		return &driveFile{
			ID:   cfg.DriveFileID,
			Name: "health-connect-backup.zip",
		}, nil
	}

	query := fmt.Sprintf("'%s' in parents and trashed = false", escapeDriveQuery(cfg.DriveFolderID))
	if cfg.DriveNameContains != "" {
		query += fmt.Sprintf(" and name contains '%s'", escapeDriveQuery(cfg.DriveNameContains))
	}

	params := url.Values{}
	params.Set("q", query)
	params.Set("pageSize", "1")
	params.Set("orderBy", "modifiedTime desc")
	params.Set("fields", "files(id,name,modifiedTime,mimeType)")
	params.Set("supportsAllDrives", "true")
	params.Set("includeItemsFromAllDrives", "true")

	req, err := http.NewRequest(http.MethodGet, "https://www.googleapis.com/drive/v3/files?"+params.Encode(), nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("Drive list failed with %d: %s", resp.StatusCode, string(body))
	}

	var list driveListResponse
	if err := json.Unmarshal(body, &list); err != nil {
		return nil, err
	}
	if len(list.Files) == 0 {
		return nil, errors.New("no matching backup files found in Drive folder")
	}
	return &list.Files[0], nil
}

func escapeDriveQuery(value string) string {
	return strings.ReplaceAll(value, "'", "\\'")
}

func downloadDriveFile(token, fileID, destPath string) error {
	req, err := http.NewRequest(
		http.MethodGet,
		fmt.Sprintf("https://www.googleapis.com/drive/v3/files/%s?alt=media&supportsAllDrives=true", url.PathEscape(fileID)),
		nil,
	)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("Drive download failed with %d: %s", resp.StatusCode, string(body))
	}

	if err := os.MkdirAll(filepath.Dir(destPath), 0755); err != nil {
		return err
	}
	out, err := os.Create(destPath)
	if err != nil {
		return err
	}
	defer out.Close()

	_, err = io.Copy(out, resp.Body)
	return err
}

func unzip(src, dest string) error {
	reader, err := zip.OpenReader(src)
	if err != nil {
		return err
	}
	defer reader.Close()

	for _, file := range reader.File {
		targetPath := filepath.Join(dest, file.Name)
		if !strings.HasPrefix(filepath.Clean(targetPath), filepath.Clean(dest)+string(os.PathSeparator)) &&
			filepath.Clean(targetPath) != filepath.Clean(dest) {
			return fmt.Errorf("zip contains invalid path: %s", file.Name)
		}

		if file.FileInfo().IsDir() {
			if err := os.MkdirAll(targetPath, 0755); err != nil {
				return err
			}
			continue
		}

		if err := os.MkdirAll(filepath.Dir(targetPath), 0755); err != nil {
			return err
		}

		in, err := file.Open()
		if err != nil {
			return err
		}

		out, err := os.Create(targetPath)
		if err != nil {
			in.Close()
			return err
		}

		if _, err := io.Copy(out, in); err != nil {
			in.Close()
			out.Close()
			return err
		}
		in.Close()
		out.Close()
	}

	return nil
}

func findDatabaseFile(rootDir, preferredName string) (string, error) {
	var candidates []candidateDB

	err := filepath.Walk(rootDir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if info.IsDir() {
			return nil
		}

		lowerName := strings.ToLower(info.Name())
		if !strings.HasSuffix(lowerName, ".db") && !strings.HasSuffix(lowerName, ".sqlite") {
			return nil
		}

		score := 0
		if info.Name() == preferredName {
			score += 100
		}
		if strings.Contains(lowerName, "health") {
			score += 40
		}
		if strings.Contains(lowerName, "connect") {
			score += 30
		}
		if strings.Contains(lowerName, "export") {
			score += 20
		}

		candidates = append(candidates, candidateDB{
			path:  path,
			score: score,
			size:  info.Size(),
		})
		return nil
	})
	if err != nil {
		return "", err
	}
	if len(candidates) == 0 {
		return "", errors.New("no .db or .sqlite file found")
	}

	sort.SliceStable(candidates, func(i, j int) bool {
		if candidates[i].score == candidates[j].score {
			return candidates[i].size > candidates[j].size
		}
		return candidates[i].score > candidates[j].score
	})
	return candidates[0].path, nil
}

func copyFile(src, dst string) error {
	input, err := os.ReadFile(src)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(dst), 0755); err != nil {
		return err
	}
	return os.WriteFile(dst, input, 0644)
}

func runCommand(command string) error {
	cmd := exec.Command("sh", "-c", command)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	cmd.Stdin = bytes.NewReader(nil)
	return cmd.Run()
}

func sanitizeFileName(name string) string {
	name = strings.TrimSpace(name)
	if name == "" {
		return "health-connect-backup.zip"
	}
	name = strings.ReplaceAll(name, "/", "_")
	name = strings.ReplaceAll(name, "\\", "_")
	return name
}

func loadDriveSyncState(path string) (*driveSyncState, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var state driveSyncState
	if err := json.Unmarshal(data, &state); err != nil {
		return nil, err
	}
	return &state, nil
}

func saveDriveSyncState(path string, state *driveSyncState) error {
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(state, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0644)
}

