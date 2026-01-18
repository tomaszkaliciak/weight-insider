package main

import (
	"bytes"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/http/httputil"
	"os"
	"strings"
	"sync"
	"time"

	_ "github.com/mattn/go-sqlite3"
)

const (
	FitatuAPIBaseURL = "https://pl-pl.fitatu.com/api"
	ApiSecret        = "PYRXtfs88UDJMuCCrNpLV"
	ApiKey           = "FITATU-MOBILE-APP"
	ContentType      = "application/json;charset=UTF-8"
	CredentialsFile  = "credentials.json"
	DataJSONPath     = "../frontend/data.json"
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

type PlanData struct {
	DietPlan map[string]Meal `json:"dietPlan"`
}

type Meal struct {
	Items []Item `json:"items"`
}

type Item struct {
	Energy float64 `json:"energy"`
}

type PlanDataDay struct {
	planData    PlanData
	calendarDay time.Time
}

type TotalCaloriesBurnedRecord struct {
	RowID                  int64
	AppInfoID              sql.NullInt64
	Energy                 sql.NullFloat64
	LocalDateTimeStartTime sql.NullInt64
	LocalDateTimeEndTime   sql.NullInt64
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
	if err := json.Unmarshal(headerJSON, &header); err != nil {
		return nil, fmt.Errorf("failed to unmarshal header: %w", err)
	}

	var payload map[string]any
	if err := json.Unmarshal(payloadJSON, &payload); err != nil {
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
	if err := json.Unmarshal(byteValue, &credentials); err != nil {
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

	requestDump, _ := httputil.DumpRequestOut(req, true)
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
	if err := json.Unmarshal(body, &responseData); err != nil {
		return "", "", fmt.Errorf("error unmarshaling JSON: %w", err)
	}

	token, ok := responseData["token"].(string)
	if !ok {
		return "", "", fmt.Errorf("token not found or not a string")
	}

	refreshToken, ok := responseData["refresh_token"].(string)
	if !ok {
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
	if err := json.Unmarshal(body, &weightData); err != nil {
		return nil, fmt.Errorf("error unmarshaling JSON: %w", err)
	}
	return &weightData, nil
}

func fetchintakeData(client *http.Client, userID, token string, dateToCheck time.Time) (*PlanData, error) {
	url := fmt.Sprintf("%s/diet-and-activity-plan/%s/day/%s", FitatuAPIBaseURL, userID, dateToCheck.Format("2006-01-02"))

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

	var planData PlanData
	if err := json.Unmarshal(body, &planData); err != nil {
		return nil, fmt.Errorf("error unmarshaling JSON: %w", err)
	}
	return &planData, nil
}

func fetchTotalCaloriesBurnedRecords(db *sql.DB) ([]TotalCaloriesBurnedRecord, error) {
	query := "SELECT row_id, energy, app_info_id, local_date_time_start_time, local_date_time_end_time FROM total_calories_burned_record_table"

	rows, err := db.Query(query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var records []TotalCaloriesBurnedRecord
	for rows.Next() {
		var r TotalCaloriesBurnedRecord
		if err := rows.Scan(&r.RowID, &r.Energy, &r.AppInfoID, &r.LocalDateTimeStartTime, &r.LocalDateTimeEndTime); err != nil {
			return nil, err
		}
		records = append(records, r)
	}
	return records, rows.Err()
}

func getCaloriesBurnedRecords(records []TotalCaloriesBurnedRecord) map[string]float64 {
	fmt.Println("\n--- Total Calories Burned Records ---")
	data := make(map[string]float64)

	for _, r := range records {
		energy := r.Energy.Float64 / 1000
		unixTimestamp := time.Unix(r.LocalDateTimeStartTime.Int64/1000, 0)

		date := unixTimestamp.Format("2006-01-02")

		// we trust appinfoid 1 (com.google.android.apps.fitness) for now to avoid dealing with duplicates between apps
		if r.AppInfoID.Int64 == 1 {
			data[date] += energy
		}
	}
	return data
}

func loadOrInitData(filename string) (*WeightInsiderData, error) {
	data := &WeightInsiderData{
		BodyFat:              make(map[string]float64),
		CalorieIntake:        make(map[string]int),
		GoogleFitExpenditure: make(map[string]int),
		Weights:              make(map[string]float64),
	}

	file, err := os.ReadFile(filename)
	if os.IsNotExist(err) {
		return data, nil
	} else if err != nil {
		return nil, fmt.Errorf("error reading file %s: %w", filename, err)
	}

	if len(file) > 0 {
		if err := json.Unmarshal(file, data); err != nil {
			log.Printf("Warning: Failed to unmarshal existing JSON (might be corrupted): %v. Starting fresh.", err)
			return data, nil
		}
	}

	if data.BodyFat == nil {
		data.BodyFat = make(map[string]float64)
	}
	if data.CalorieIntake == nil {
		data.CalorieIntake = make(map[string]int)
	}
	if data.GoogleFitExpenditure == nil {
		data.GoogleFitExpenditure = make(map[string]int)
	}
	if data.Weights == nil {
		data.Weights = make(map[string]float64)
	}

	return data, nil
}

func saveData(filename string, data *WeightInsiderData) error {
	updatedData, err := json.MarshalIndent(data, "", "  ")
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

	token, _, err := fitatuLogin(client, credentials)
	if err != nil {
		log.Fatalf("Login failed: %v", err)
	}
	fmt.Println("Login successful.")

	jwtData, err := DecodeJWT(token)
	if err != nil {
		log.Fatalf("Error decoding JWT: %v", err)
	}
	idValue, ok := jwtData.Payload["id"].(string)
	if !ok {
		log.Fatalf("JWT ID not found")
	}

	fmt.Printf("Loading existing data from %s...\n", DataJSONPath)
	insiderData, err := loadOrInitData(DataJSONPath)
	if err != nil {
		log.Fatalf("Failed to load existing data: %v", err)
	}

	fmt.Println("Fetching weight data...")
	weightData, err := fetchWeightData(client, idValue, token)
	if err != nil {
		log.Printf("Failed to fetch weight data: %v", err)
	} else {
		for date, weight := range weightData.Weights {
			insiderData.Weights[date] = weight
		}
		fmt.Printf("Updated %d weight records.\n", len(weightData.Weights))
	}

	fmt.Println("Fetching intake data (last 90 days)...")
	now := time.Now().UTC()
	numRequests := 90

	var wg sync.WaitGroup
	wg.Add(numRequests)
	results := make(chan PlanDataDay, numRequests)

	for i := 0; i < numRequests; i++ {
		go func(dayOffset int) {
			defer wg.Done()
			dateToCheck := now.AddDate(0, 0, -dayOffset)
			intakeData, err := fetchintakeData(client, idValue, token, dateToCheck)
			if err == nil {
				results <- PlanDataDay{planData: *intakeData, calendarDay: dateToCheck}
			}
		}(i)
	}

	go func() {
		wg.Wait()
		close(results)
	}()

	countIntake := 0
	for result := range results {
		sum := 0.0
		for _, value := range result.planData.DietPlan {
			for _, element := range value.Items {
				sum += element.Energy
			}
		}
		if sum > 0 {
			dateKey := result.calendarDay.Format("2006-01-02")
			insiderData.CalorieIntake[dateKey] = int(sum)
			countIntake++
		}
	}
	fmt.Printf("Updated %d intake records.\n", countIntake)

	fmt.Println("Fetching expenditure from DB...")
	db, err := sql.Open("sqlite3", "./health_connect_export.db")
	if err != nil {
		log.Printf("Failed to open database: %v", err)
	} else {
		caloriesBurnedRecords, err := fetchTotalCaloriesBurnedRecords(db)
		if err != nil {
			log.Printf("Could not fetch total calories burned records: %v", err)
		} else {
			expenditureRecords := getCaloriesBurnedRecords(caloriesBurnedRecords)
			for date, kcal := range expenditureRecords {
				insiderData.GoogleFitExpenditure[date] = int(kcal)
			}
			fmt.Printf("Updated %d expenditure records.\n", len(expenditureRecords))
		}
		db.Close()
	}

	fmt.Printf("Saving all data to %s...\n", DataJSONPath)
	if err := saveData(DataJSONPath, insiderData); err != nil {
		log.Fatalf("Failed to save data.json: %v", err)
	}
	fmt.Println("Success! All data updated and valid JSON saved.")
}
