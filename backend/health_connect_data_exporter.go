package main

import (
	"database/sql"
	"fmt"
	"log"
	"time"

	_ "github.com/mattn/go-sqlite3"
)

// weight_record_table
type WeightRecord struct {
	RowID               int64
	UUID                []byte
	LastModifiedTime    int64
	ClientRecordID      sql.NullString
	ClientRecordVersion sql.NullString
	DeviceInfoID        sql.NullInt64
	AppInfoID           sql.NullInt64
	RecordingMethod     sql.NullInt64
	DedupeHash          []byte
	Time                int64
	ZoneOffset          int64
	LocalDate           int64
	Weight              float64
	LocalDateTime       int64
}

// nutrition_record_table
type NutritionRecord struct {
	RowID               int64
	UUID                []byte
	LastModifiedTime    sql.NullInt64
	ClientRecordID      sql.NullString
	ClientRecordVersion sql.NullString
	DeviceInfoID        sql.NullInt64
	AppInfoID           sql.NullInt64
	RecordingMethod     sql.NullInt64
	DedupeHash          []byte
	StartTime           sql.NullInt64
	StartZoneOffset     sql.NullInt64
	EndTime             sql.NullInt64
	EndZoneOffset       sql.NullInt64
	LocalDate           sql.NullInt64
	Energy              sql.NullFloat64 // (kcal)
	Protein             sql.NullFloat64
	TotalCarbohydrate   sql.NullFloat64
	TotalFat            sql.NullFloat64
	MealName            sql.NullString
}

// total_calories_burned_record_table
type TotalCaloriesBurnedRecord struct {
	RowID                  int64
	UUID                   []byte
	LastModifiedTime       sql.NullInt64
	ClientRecordID         sql.NullString
	ClientRecordVersion    sql.NullString
	DeviceInfoID           sql.NullInt64
	AppInfoID              sql.NullInt64
	RecordingMethod        sql.NullInt64
	DedupeHash             []byte
	StartTime              sql.NullInt64
	StartZoneOffset        sql.NullInt64
	EndTime                sql.NullInt64
	EndZoneOffset          sql.NullInt64
	LocalDate              sql.NullInt64
	Energy                 sql.NullFloat64 // (kcal)
	LocalDateTimeStartTime sql.NullInt64
	LocalDateTimeEndTime   sql.NullInt64
}

func main() {
	db, err := sql.Open("sqlite3", "./health_connect_export.db")
	if err != nil {
		log.Fatalf("Fatal: Failed to open database: %v", err)
	}
	defer db.Close()

	weightRecords, err := fetchWeightRecords(db)
	if err != nil {
		log.Fatalf("Fatal: Could not fetch weight records: %v", err)
	}

	nutritionRecords, err := fetchNutritionRecords(db)
	if err != nil {
		log.Fatalf("Fatal: Could not fetch nutrition records: %v", err)
	}

	caloriesBurnedRecords, err := fetchTotalCaloriesBurnedRecords(db)
	if err != nil {
		log.Fatalf("Fatal: Could not fetch total calories burned records: %v", err)
	}

	printWeightRecords(weightRecords)
	printNutritionRecords(nutritionRecords)
	printCaloriesBurnedRecords(caloriesBurnedRecords)
}

func fetchWeightRecords(db *sql.DB) ([]WeightRecord, error) {
	query := "SELECT row_id, uuid, last_modified_time, client_record_id, client_record_version, device_info_id, app_info_id, recording_method, dedupe_hash, time, zone_offset, local_date, weight, local_date_time FROM weight_record_table"
	rows, err := db.Query(query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var records []WeightRecord
	for rows.Next() {
		var r WeightRecord
		if err := rows.Scan(&r.RowID, &r.UUID, &r.LastModifiedTime, &r.ClientRecordID, &r.ClientRecordVersion, &r.DeviceInfoID, &r.AppInfoID, &r.RecordingMethod, &r.DedupeHash, &r.Time, &r.ZoneOffset, &r.LocalDate, &r.Weight, &r.LocalDateTime); err != nil {
			return nil, err
		}
		records = append(records, r)
	}
	return records, rows.Err()
}

func fetchNutritionRecords(db *sql.DB) ([]NutritionRecord, error) {
	query := "SELECT row_id, uuid, last_modified_time, client_record_id, client_record_version, device_info_id, app_info_id, recording_method, dedupe_hash, start_time, start_zone_offset, end_time, end_zone_offset, local_date, energy, protein, total_carbohydrate, total_fat, meal_name FROM nutrition_record_table"
	rows, err := db.Query(query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var records []NutritionRecord
	for rows.Next() {
		var r NutritionRecord
		if err := rows.Scan(&r.RowID, &r.UUID, &r.LastModifiedTime, &r.ClientRecordID, &r.ClientRecordVersion, &r.DeviceInfoID, &r.AppInfoID, &r.RecordingMethod, &r.DedupeHash, &r.StartTime, &r.StartZoneOffset, &r.EndTime, &r.EndZoneOffset, &r.LocalDate, &r.Energy, &r.Protein, &r.TotalCarbohydrate, &r.TotalFat, &r.MealName); err != nil {
			return nil, err
		}
		records = append(records, r)
	}
	return records, rows.Err()
}

func fetchTotalCaloriesBurnedRecords(db *sql.DB) ([]TotalCaloriesBurnedRecord, error) {
	query := "SELECT row_id, uuid, last_modified_time, client_record_id, client_record_version, device_info_id, app_info_id, recording_method, dedupe_hash, start_time, start_zone_offset, end_time, end_zone_offset, local_date, energy, local_date_time_start_time, local_date_time_end_time FROM total_calories_burned_record_table"
	rows, err := db.Query(query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var records []TotalCaloriesBurnedRecord
	for rows.Next() {
		var r TotalCaloriesBurnedRecord
		if err := rows.Scan(&r.RowID, &r.UUID, &r.LastModifiedTime, &r.ClientRecordID, &r.ClientRecordVersion, &r.DeviceInfoID, &r.AppInfoID, &r.RecordingMethod, &r.DedupeHash, &r.StartTime, &r.StartZoneOffset, &r.EndTime, &r.EndZoneOffset, &r.LocalDate, &r.Energy, &r.LocalDateTimeStartTime, &r.LocalDateTimeEndTime); err != nil {
			return nil, err
		}
		records = append(records, r)
	}
	return records, rows.Err()
}

func printWeightRecords(records []WeightRecord) {
	fmt.Println("\n--- Weight Records ---")
	if len(records) == 0 {
		fmt.Println("No records found.")
		return
	}
	for _, r := range records {
		fmt.Printf("RowID: %d, Weight: %.2f, Record Time: %s\n",
			r.RowID,
			r.Weight,
			time.Unix(r.Time, 0).Format(time.RFC1123),
		)
	}
}

func printNutritionRecords(records []NutritionRecord) {
	fmt.Println("\n--- Nutrition Records ---")
	if len(records) == 0 {
		fmt.Println("No records found.")
		return
	}
	for _, r := range records {
		mealName := "N/A"
		if r.MealName.Valid {
			mealName = r.MealName.String
		}

		energy := 0.0
		if r.Energy.Valid {
			energy = r.Energy.Float64
		}

		startTime := "N/A"
		if r.StartTime.Valid {
			startTime = time.Unix(r.StartTime.Int64, 0).Format(time.RFC1123)
		}

		fmt.Printf("RowID: %d, Meal: %s, Energy: %.2f kcal, Start Time: %s\n",
			r.RowID,
			mealName,
			energy,
			startTime,
		)
	}
}

func printCaloriesBurnedRecords(records []TotalCaloriesBurnedRecord) {
	fmt.Println("\n--- Total Calories Burned Records ---")
	if len(records) == 0 {
		fmt.Println("No records found.")
		return
	}
	for _, r := range records {
		energy := 0.0
		if r.Energy.Valid {
			energy = r.Energy.Float64
		}

		startTime := "N/A"
		if r.StartTime.Valid {
			startTime = time.Unix(r.StartTime.Int64, 0).Format(time.RFC1123)
		}

		fmt.Printf("RowID: %d, Calories Burned: %.2f kcal, Start Time: %s\n",
			r.RowID,
			energy,
			startTime,
		)
	}
}
