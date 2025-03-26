package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/http/httputil"
)

type WeightData struct {
	Weights    map[string]float64 `json:"weights"`
	Targets    map[string]float64 `json:"targets"`
	WeightUnit string             `json:"weightUnit"`
}

func main() {

	values := map[string]string{"_username": "email", "_password": "password"}

	jsonValue, _ := json.Marshal(values)

	client := &http.Client{}

	req, err := http.NewRequest("POST", "https://pl-pl.fitatu.com/api/login", bytes.NewBuffer(jsonValue))
	if err != nil {
		log.Fatalf("Error creating request: %v", err)
	}
	req.Header.Set("api-secret", "PYRXtfs88UDJMuCCrNpLV")
	req.Header.Set("api-key", "FITATU-MOBILE-APP")
	req.Header.Add("content-Type", "application/json;charset=UTF-8")

	requestDump, err := httputil.DumpRequestOut(req, true)
	if err != nil {
		log.Printf("Error dumping request: %v\n", err)
	}
	fmt.Printf("Request:\n%s\n", string(requestDump))

	resp, err := client.Do(req)
	if err != nil {
		log.Fatalf("Error sending request: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		log.Printf("Request failed with status code: %d\n", resp.StatusCode)
		return
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		log.Fatalf("Error reading response: %v", err)
	}

	var responseData map[string]any
	err = json.Unmarshal(body, &responseData)
	if err != nil {
		log.Fatalf("Error unmarshaling JSON: %v", err)
	}

	token, ok := responseData["token"].(string)
	if !ok {
		log.Println("Token not found or not a string")
		token = ""
	}

	refreshToken, ok := responseData["refresh_token"].(string)
	if !ok {
		log.Println("Refresh token not found or not a string")
		refreshToken = ""
	}

	fmt.Printf("Token: %s\n", token)
	fmt.Printf("Refresh Token: %s\n", refreshToken)

	req2, err2 := http.NewRequest("GET", "https://pl-pl.fitatu.com/api/users/<userid>/measurements/chart/weight", bytes.NewBuffer(jsonValue))
	if err2 != nil {
		log.Fatalf("Error creating request: %v", err2)
	}
	req2.Header.Set("api-secret", "PYRXtfs88UDJMuCCrNpLV")
	req2.Header.Set("api-key", "FITATU-MOBILE-APP")
	req2.Header.Add("content-Type", "application/json;charset=UTF-8")
	req2.Header.Set("authorization", "Bearer "+token)

	resp2, err3 := client.Do(req2)
	if err3 != nil {
		log.Fatalf("Error sending request: %v", err3)
	}
	defer resp2.Body.Close()

	if resp2.StatusCode != http.StatusOK {
		log.Printf("Request failed with status code: %d\n", resp2.StatusCode)
		return
	}
	body2, err4 := io.ReadAll(resp2.Body)
	if err4 != nil {
		log.Fatalf("Error reading response: %v", 4)
	}

	var weightData WeightData
	err = json.Unmarshal(body2, &weightData)
	if err != nil {
		log.Fatalf("Error unmarshaling JSON: %v", err)
	}

	fmt.Printf("Weight Unit: %s\n", weightData.WeightUnit)
}
