package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

var (
	syncMutex         sync.Mutex
	isSyncing         bool
	lastSyncExecution time.Time
)

type SyncResponse struct {
	Success   bool           `json:"success"`
	Message   string         `json:"message,omitempty"`
	Error     string         `json:"error,omitempty"`
	LastSync  map[string]any `json:"lastSync,omitempty"`
	Timestamp string         `json:"timestamp"`
}

// loadEnvFile reads a simple KEY=VALUE file and sets environment variables if not already set.
func loadEnvFile(path string) {
	file, err := os.Open(path)
	if err != nil {
		return
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		parts := strings.SplitN(line, "=", 2)
		if len(parts) == 2 {
			key := strings.TrimSpace(parts[0])
			val := strings.TrimSpace(parts[1])
			val = strings.Trim(val, `"'`)
			if _, exists := os.LookupEnv(key); !exists {
				os.Setenv(key, val)
			}
		}
	}
}

func getLastSyncFromData(dataPath string) map[string]any {
	data, err := os.ReadFile(dataPath)
	if err != nil {
		return nil
	}
	var raw map[string]any
	if err := json.Unmarshal(data, &raw); err != nil {
		return nil
	}
	if ls, ok := raw["lastSync"].(map[string]any); ok {
		return ls
	}
	return nil
}

func handleSyncStatus(w http.ResponseWriter, r *http.Request, dataPath string) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, X-Sync-Token")

	syncMutex.Lock()
	syncing := isSyncing
	syncMutex.Unlock()

	lastSync := getLastSyncFromData(dataPath)

	resp := map[string]any{
		"success":   true,
		"syncing":   syncing,
		"lastSync":  lastSync,
		"timestamp": time.Now().UTC().Format(time.RFC3339),
	}
	json.NewEncoder(w).Encode(resp)
}

func handleSync(w http.ResponseWriter, r *http.Request, scriptPath, dataPath string) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, X-Sync-Token")

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		json.NewEncoder(w).Encode(SyncResponse{Success: false, Error: "Method not allowed"})
		return
	}

	// Validate security token if configured (crucial for internet-exposed servers)
	if expectedToken := strings.TrimSpace(os.Getenv("WI_SYNC_TOKEN")); expectedToken != "" {
		token := strings.TrimSpace(r.Header.Get("X-Sync-Token"))
		if token == "" {
			token = strings.TrimSpace(r.URL.Query().Get("token"))
		}
		if token != expectedToken {
			w.WriteHeader(http.StatusUnauthorized)
			json.NewEncoder(w).Encode(SyncResponse{
				Success:   false,
				Error:     "Unauthorized: sync token is missing or invalid",
				Timestamp: time.Now().UTC().Format(time.RFC3339),
			})
			return
		}
	}

	syncMutex.Lock()
	if isSyncing {
		syncMutex.Unlock()
		w.WriteHeader(http.StatusConflict)
		json.NewEncoder(w).Encode(SyncResponse{
			Success:   false,
			Error:     "Sync already in progress",
			Timestamp: time.Now().UTC().Format(time.RFC3339),
		})
		return
	}

	// 20s cooldown to prevent spamming Fitatu / Google Drive
	if time.Since(lastSyncExecution) < 20*time.Second {
		syncMutex.Unlock()
		w.WriteHeader(http.StatusTooManyRequests)
		json.NewEncoder(w).Encode(SyncResponse{
			Success:   false,
			Error:     "Rate limited: sync was performed recently. Please wait a few moments.",
			Timestamp: time.Now().UTC().Format(time.RFC3339),
		})
		return
	}

	isSyncing = true
	lastSyncExecution = time.Now()
	syncMutex.Unlock()

	defer func() {
		syncMutex.Lock()
		isSyncing = false
		syncMutex.Unlock()
	}()

	log.Println("[SyncServer] Executing sync command:", scriptPath)
	var cmd *exec.Cmd
	if strings.HasSuffix(scriptPath, ".sh") {
		cmd = exec.Command("/bin/bash", scriptPath)
	} else {
		cmd = exec.Command(scriptPath)
	}
	cmd.Dir = filepath.Dir(scriptPath)
	output, err := cmd.CombinedOutput()

	if err != nil {
		log.Printf("[SyncServer] Sync failed: %v\nOutput: %s", err, string(output))
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(SyncResponse{
			Success:   false,
			Error:     fmt.Sprintf("Sync failed: %v", err),
			Message:   string(output),
			Timestamp: time.Now().UTC().Format(time.RFC3339),
		})
		return
	}

	log.Println("[SyncServer] Sync succeeded:\n", string(output))
	lastSync := getLastSyncFromData(dataPath)

	json.NewEncoder(w).Encode(SyncResponse{
		Success:   true,
		Message:   "Sync completed successfully",
		LastSync:  lastSync,
		Timestamp: time.Now().UTC().Format(time.RFC3339),
	})
}

func main() {
	baseDir, err := os.Getwd()
	if err != nil {
		log.Fatalf("failed to get current dir: %v", err)
	}

	// Attempt to load env file from known locations if not already defined
	envCandidates := []string{
		os.Getenv("WI_SYNC_ENV_FILE"),
		filepath.Join(baseDir, "health_connect_sync.env"),
		"/etc/weight-insider/health-connect-sync.env",
	}
	for _, cand := range envCandidates {
		if cand != "" {
			loadEnvFile(cand)
		}
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = os.Getenv("WI_SYNC_SERVER_PORT")
	}
	if port == "" {
		port = "8085"
	}

	scriptPath := filepath.Join(baseDir, "run_health_connect_sync.sh")
	if envScript := os.Getenv("WI_SYNC_SCRIPT"); envScript != "" {
		scriptPath = envScript
	}

	dataPath := filepath.Join(baseDir, "../frontend/data.json")
	if envData := os.Getenv("WI_FRONTEND_DATA_JSON"); envData != "" {
		dataPath = envData
	} else if _, err := os.Stat(filepath.Join(baseDir, "../frontend/dist/data.json")); err == nil {
		dataPath = filepath.Join(baseDir, "../frontend/dist/data.json")
	}

	http.HandleFunc("/api/sync", func(w http.ResponseWriter, r *http.Request) {
		handleSync(w, r, scriptPath, dataPath)
	})

	http.HandleFunc("/api/sync/status", func(w http.ResponseWriter, r *http.Request) {
		handleSyncStatus(w, r, dataPath)
	})

	addr := ":" + strings.TrimPrefix(port, ":")
	log.Printf("[SyncServer] Starting Weight Insider Sync API server on %s (script: %s, data: %s)", addr, scriptPath, dataPath)
	if os.Getenv("WI_SYNC_TOKEN") != "" {
		log.Println("[SyncServer] Access mode: WI_SYNC_TOKEN authentication is enabled")
	} else {
		log.Println("[SyncServer] Access mode: Public sync enabled (anyone can trigger, protected with 20s cooldown)")
	}

	if err := http.ListenAndServe(addr, nil); err != nil {
		log.Fatalf("[SyncServer] Server failed: %v", err)
	}
}
