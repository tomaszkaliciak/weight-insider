package main

import (
	"database/sql"
	"fmt"
	"log"
	"strconv"
	"time"

	_ "github.com/mattn/go-sqlite3"
)

// total_calories_burned_record_table
type TotalCaloriesBurnedRecord struct {
	RowID                  int64
	AppInfoID              sql.NullInt64
	Energy                 sql.NullFloat64
	LocalDateTimeStartTime sql.NullInt64
	LocalDateTimeEndTime   sql.NullInt64
}

func main() {
	db, err := sql.Open("sqlite3", "./health_connect_export.db")
	if err != nil {
		log.Fatalf("Fatal: Failed to open database: %v", err)
	}
	defer db.Close()

	caloriesBurnedRecords, err := fetchTotalCaloriesBurnedRecords(db)
	if err != nil {
		log.Fatalf("Fatal: Could not fetch total calories burned records: %v", err)
	}

	printCaloriesBurnedRecords(caloriesBurnedRecords)
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

func printCaloriesBurnedRecords(records []TotalCaloriesBurnedRecord) {
	fmt.Println("\n--- Total Calories Burned Records ---")
	if len(records) == 0 {
		fmt.Println("No records found.")
		return
	}

	data := make(map[string]float64)

	for _, r := range records {
		energy := r.Energy.Float64 / 1000

		unixTimestamp := time.Unix(r.LocalDateTimeStartTime.Int64/1000, 0)
		year, month, day := unixTimestamp.Date()

		date := strconv.Itoa(day) + "-" + strconv.Itoa(int(month)) + "-" + strconv.Itoa(year)

		// we trust appinfoid 1 (com.google.android.apps.fitness) for now to avoid dealing with duplicates between apps
		if r.AppInfoID.Int64 == 1 {
			data[date] += energy
		}
	}

	for day, kcal := range data {
		fmt.Printf("Calories Burned: %.2f kcal, Start Time: %s\n",
			kcal,
			day,
		)
	}
}
