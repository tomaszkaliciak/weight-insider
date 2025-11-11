package main

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/http/httputil"
	"os"
	"strings"
)

const (
	FitatuAPIBaseURL = "https://pl-pl.fitatu.com/api"
	ApiSecret        = "PYRXtfs88UDJMuCCrNpLV"
	ApiKey           = "FITATU-MOBILE-APP"
	ContentType      = "application/json;charset=UTF-8"
	CredentialsFile  = "credentials.json"
)

type WeightInsiderData struct {
	BodyFat              map[string]float64 `json:"bodyFat"`
	CalorieIntake        map[string]int     `json:"calorieIntake"`
	GoogleFitExpenditure map[string]int     `json:"googleFitExpenditure"`
	Weights              map[string]float64 `json:"weights"`
}

type WeightData struct {
	Weights    map[string]float64 `json:"weights"`
	Targets    map[string]float64 `json:"targets"`
	WeightUnit string             `json:"weightUnit"`
}

type Credentials struct {
	Login    string `json:"login"`
	Password string `json:"password"`
}

type JWT struct {
	Header    map[string]any `json:"header"`
	Payload   map[string]any `json:"payload"`
	Signature string         `json:"signature"`
}

func decodeBase64(s string) ([]byte, error) {
	missing := len(s) % 4
	if missing != 0 {
		s += strings.Repeat("=", 4-missing)
	}

	decoded, err := base64.RawURLEncoding.DecodeString(s)
	if err != nil {
		decoded, err = base64.StdEncoding.DecodeString(s)
		if err != nil {
			return nil, fmt.Errorf("failed to decode base64 string: %w", err)
		}
	}
	return decoded, nil
}

func DecodeJWT(token string) (*JWT, error) {
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return nil, fmt.Errorf("invalid JWT format")
	}

	headerEncoded := parts[0]
	payloadEncoded := parts[1]
	signature := parts[2]

	headerJSON, err := decodeBase64(headerEncoded)
	if err != nil {
		return nil, fmt.Errorf("failed to decode header: %w", err)
	}

	payloadJSON, err := decodeBase64(payloadEncoded)
	if err != nil {
		return nil, fmt.Errorf("failed to decode payload: %w", err)
	}

	var header map[string]any
	err = json.Unmarshal(headerJSON, &header)
	if err != nil {
		return nil, fmt.Errorf("failed to unmarshal header: %w", err)
	}

	var payload map[string]any
	err = json.Unmarshal(payloadJSON, &payload)
	if err != nil {
		return nil, fmt.Errorf("failed to unmarshal payload: %w", err)
	}

	return &JWT{
		Header:    header,
		Payload:   payload,
		Signature: signature,
	}, nil
}

func loadCredentials(filename string) (*Credentials, error) {
	byteValue, err := os.ReadFile(filename)
	if err != nil {
		return nil, fmt.Errorf("error reading file %s: %w", filename, err)
	}

	var credentials Credentials
	err = json.Unmarshal(byteValue, &credentials)
	if err != nil {
		return nil, fmt.Errorf("error unmarshalling JSON: %w", err)
	}

	return &credentials, nil
}

func makeHTTPRequest(client *http.Client, method, url string, body io.Reader, headers map[string]string) (*http.Response, error) {
	req, err := http.NewRequest(method, url, body)
	if err != nil {
		return nil, fmt.Errorf("error creating request: %w", err)
	}

	for key, value := range headers {
		req.Header.Set(key, value)
	}

	requestDump, err := httputil.DumpRequestOut(req, true)
	if err != nil {
		log.Printf("Error dumping request: %v\n", err)
	}
	fmt.Printf("Request:\n%s\n", string(requestDump))

	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("error sending request: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("request failed with status code: %d", resp.StatusCode)
	}

	return resp, nil
}

func fitatuLogin(client *http.Client, credentials *Credentials) (string, string, error) {
	values := map[string]string{"_username": credentials.Login, "_password": credentials.Password}
	jsonValue, err := json.Marshal(values)
	if err != nil {
		return "", "", fmt.Errorf("error marshalling JSON: %w", err)
	}

	headers := map[string]string{
		"api-secret":   ApiSecret,
		"api-key":      ApiKey,
		"content-Type": ContentType,
	}

	resp, err := makeHTTPRequest(client, "POST", FitatuAPIBaseURL+"/login", bytes.NewBuffer(jsonValue), headers)
	if err != nil {
		return "", "", err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", "", fmt.Errorf("error reading response: %w", err)
	}

	var responseData map[string]any
	err = json.Unmarshal(body, &responseData)
	if err != nil {
		return "", "", fmt.Errorf("error unmarshaling JSON: %w", err)
	}

	token, ok := responseData["token"].(string)
	if !ok {
		return "", "", fmt.Errorf("token not found or not a string")
	}

	refreshToken, ok := responseData["refresh_token"].(string)
	if !ok {
		log.Println("Refresh token not found or not a string, using empty string")
		refreshToken = ""
	}

	return token, refreshToken, nil
}

func fetchWeightData(client *http.Client, userID, token string) (*WeightData, error) {
	url := fmt.Sprintf("%s/users/%s/measurements/chart/weight", FitatuAPIBaseURL, userID)

	headers := map[string]string{
		"api-secret":    ApiSecret,
		"api-key":       ApiKey,
		"content-Type":  ContentType,
		"authorization": "Bearer " + token,
	}

	resp, err := makeHTTPRequest(client, "GET", url, nil, headers)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("error reading response: %w", err)
	}

	var weightData WeightData
	err = json.Unmarshal(body, &weightData)
	if err != nil {
		return nil, fmt.Errorf("error unmarshaling JSON: %w", err)
	}

	return &weightData, nil
}

func updateDataJSON(filename string, newWeights map[string]float64) error {
	file, err := os.ReadFile(filename)
	var insiderData WeightInsiderData

	if err == nil && len(file) > 0 {
		if err := json.Unmarshal(file, &insiderData); err != nil {
			return fmt.Errorf("error unmarshalling existing data from %s: %w", filename, err)
		}
	} else if !os.IsNotExist(err) {
		return fmt.Errorf("error reading file %s: %w", filename, err)
	}

	if insiderData.Weights == nil {
		insiderData.Weights = make(map[string]float64)
	}
	for date, weight := range newWeights {
		insiderData.Weights[date] = weight
	}

	updatedData, err := json.MarshalIndent(insiderData, "", "  ")
	if err != nil {
		return fmt.Errorf("error marshalling updated data to JSON: %w", err)
	}

	if err := os.WriteFile(filename, updatedData, 0644); err != nil {
		return fmt.Errorf("error writing updated data to file %s: %w", filename, err)
	}

	return nil
}

func main() {
	client := &http.Client{}

	credentials, err := loadCredentials(CredentialsFile)
	if err != nil {
		log.Fatalf("Failed to load credentials: %v", err)
	}

	token, refreshToken, err := fitatuLogin(client, credentials)
	if err != nil {
		log.Fatalf("Login failed: %v", err)
	}

	fmt.Printf("Token: %s\n", token)
	fmt.Printf("Refresh Token: %s\n", refreshToken)

	jwtData, err := DecodeJWT(token)
	if err != nil {
		log.Fatalf("Error decoding JWT: %v", err)
	}

	fmt.Println("Header:", jwtData.Header)
	fmt.Println("Payload:", jwtData.Payload)
	fmt.Println("Signature:", jwtData.Signature)

	idValue, ok := jwtData.Payload["id"].(string)
	if !ok {
		log.Fatalf("JWT ID not found or not a string")
	}

	fmt.Println("JWT ID is: ", idValue)

	weightData, err := fetchWeightData(client, idValue, token)
	if err != nil {
		log.Fatalf("Failed to fetch weight data: %v", err)
	}

	fmt.Printf("Weight data: %+v\n", weightData.Weights)

	dataJSONPath := "../frontend/data.json"
	if err := updateDataJSON(dataJSONPath, weightData.Weights); err != nil {
		log.Fatalf("Failed to update data.json: %v", err)
	}
	fmt.Printf("Successfully updated weights in %s\n", dataJSONPath)
}
