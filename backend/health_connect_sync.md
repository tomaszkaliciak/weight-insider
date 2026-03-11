# Health Connect Drive Sync

This adds an automation path for your home lab:

1. Download the latest Health Connect backup ZIP from Google Drive
2. Extract it locally
3. Find the SQLite database inside the extracted backup
4. Copy it to `backend/health_connect_export.db`
5. Run `data_exporter.go`
6. Mirror the generated `data.json` into `frontend/dist/data.json` when `dist/` exists

## Why service account auth

For cron jobs on a server, a Google Drive service account is the simplest option because it does not require interactive login during each run.

Important:

- Create a Google Cloud service account and download its JSON key
- Share the Google Drive folder or file containing your Health Connect backup with the service account email
- The sync job will then be able to read that file/folder using Drive API

## Files added

- `backend/cmd/health-connect-sync/main.go`
- `backend/run_health_connect_sync.sh`
- `backend/health_connect_sync.env.example`

## Setup

Place a copy of the example env file next to the script:

```bash
cd backend
cp health_connect_sync.env.example health_connect_sync.env
```

Then edit `health_connect_sync.env`:

- `WI_GDRIVE_SERVICE_ACCOUNT_FILE`: path to the service account JSON key
- `WI_GDRIVE_FILE_ID`: direct Drive file id, if you want to always download one exact file
- `WI_GDRIVE_FOLDER_ID`: Drive folder id, if you want the newest backup from a folder
- `WI_GDRIVE_NAME_CONTAINS`: optional filename filter when using a folder
- `WI_SYNC_COMMAND`: defaults to `go run ./cmd/health-connect-sync`; you can switch this to a compiled binary later
- `WI_HEALTH_DB_FILENAME`: expected SQLite filename inside the extracted backup
- `WI_EXPORTER_COMMAND`: defaults to `go run ./data_exporter.go`

You must set either `WI_GDRIVE_FILE_ID` or `WI_GDRIVE_FOLDER_ID`.

## Running manually

```bash
cd backend
bash ./run_health_connect_sync.sh
```

The sync command assumes the Drive backup is a ZIP archive.
The default wrapper uses `go run`, so your home-lab host needs a working Go toolchain unless you switch `WI_SYNC_COMMAND` and `WI_EXPORTER_COMMAND` to compiled binaries.

## Cron example

Run every day at 05:10 and log to a file:

```cron
10 5 * * * cd /path/to/weight-insider/backend && /bin/bash ./run_health_connect_sync.sh >> /var/log/weight-insider-sync.log 2>&1
```

## systemd example

Template unit files are included in:

- `backend/systemd/weight-insider-health-connect-sync.service`
- `backend/systemd/weight-insider-health-connect-sync.timer`

They currently assume:

- project path: `/opt/weight-insider/backend`
- service user/group: `weightinsider`
- env file: `/etc/weight-insider/health-connect-sync.env`

Adjust those paths if your home-lab layout is different.

Example install flow:

```bash
sudo mkdir -p /etc/weight-insider
sudo cp /path/to/weight-insider/backend/health_connect_sync.env /etc/weight-insider/health-connect-sync.env
sudo cp /path/to/weight-insider/backend/systemd/weight-insider-health-connect-sync.service /etc/systemd/system/
sudo cp /path/to/weight-insider/backend/systemd/weight-insider-health-connect-sync.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now weight-insider-health-connect-sync.timer
```

Run once manually:

```bash
sudo systemctl start weight-insider-health-connect-sync.service
```

Inspect logs:

```bash
journalctl -u weight-insider-health-connect-sync.service -n 200 --no-pager
```

## Deploy note

Your exporter still writes the primary file to `frontend/data.json`.

The new sync command also copies that file to `frontend/dist/data.json` when `frontend/dist/` exists, which helps when the deployed site is serving the built `dist/` output.

## If the backup layout differs

The sync command tries to find the best matching `.db` or `.sqlite` file in the extracted ZIP and prefers `WI_HEALTH_DB_FILENAME`.

If Google changes the backup structure or filename:

- update `WI_HEALTH_DB_FILENAME`
- or point `WI_GDRIVE_FILE_ID` at a single known backup file
