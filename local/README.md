# Running the scheduling system on a school PC

One PC runs the app; everyone on the same school network opens it in a browser. The AI Assistant needs that PC to have internet; everything else works without it.

## 1. Install the programs (once)

Open PowerShell and run:

```powershell
winget install PHP.PHP.8.5
winget install ApacheLounge.httpd
winget install PostgreSQL.PostgreSQL.18
```

The PostgreSQL installer asks for a password for its `postgres` account. Write it down; setup asks for it once. PostgreSQL then starts by itself whenever the PC starts.

Close PowerShell afterwards so the new programs are found.

## 2. Set it up (once)

Right-click `setup.cmd` and choose **Run as administrator** (needed so the firewall lets other PCs in). It asks for:

1. The `postgres` password from step 1.
2. The Gemini API key from https://aistudio.google.com/app/apikey (leave blank to add it later in `.env`).
3. A password for the admin account `admin@sti.edu`, twice.
4. `SETUP`, to confirm.

It creates an empty database `defaultdb`, the tables, the seven subject areas and the admin account, and saves the settings in `.env` in the project folder. Never share or commit `.env`: it holds the database password and the Gemini key.

Setup also:

- Sends backups to the school OneDrive (a folder `STI Scheduler Backups`) when the OneDrive app is signed in with a school account; otherwise to `local\backups`. Sign in to OneDrive first, or run setup again afterwards.
- Schedules a backup every day at 5:00 PM while you are signed in (Task Scheduler: "STI Scheduler Daily Backup"). If the PC is off then, it runs at the next chance.
- Offers to keep the PC awake while plugged in, since nobody can open the app while it sleeps.

## 3. Daily use

| Double-click | What it does |
| --- | --- |
| `start.cmd` | Starts the app and shows the addresses to open: by this PC's name (such as `http://desktop-av:8080`) and by its network address (such as `http://192.168.1.20:8080`) |
| `stop.cmd` | Stops the app |
| `backup.cmd` | Saves a backup now, to the same folder as the daily backups (the 30 newest are kept) |

The app keeps running after the Start window closes. After a restart of the PC, run `start.cmd` again.

Every backup is noted in `local\run\backup-history.log` (OK or FAILED), so you can check the daily backups are happening. `backup.cmd` shows the command to restore one. Without OneDrive, copy the backups off this PC now and then (for example to a USB drive): if this PC fails, the data is only in those copies.

## Moving to the school PC

The data entered on the test PC comes along through a backup.

1. On the test PC: run `backup.cmd`, then `stop.cmd`.
2. Zip the whole project folder and copy it to the school PC. Keep the zip private: its `.env` holds the Gemini key and the test PC's database password.
3. On the school PC: unzip it, install the programs (step 1), then right-click `setup.cmd` and choose **Run as administrator**.
4. Setup notices the settings came from another PC, creates the database there (keeping the Gemini key), and offers to restore the newest backup it finds in `local\backups` or the school OneDrive backup folder. Type `Y`. Everyone signs in with the same accounts and passwords as on the test PC.
5. Double-click `start.cmd`.

To start fresh instead, type `N` when setup offers the backup.

## Good to know

- Give this PC a fixed address on the network (ask the school's IT), or the address people open can change. The name link (`http://<pc-name>:8080`) keeps working when the address changes, if the network allows name lookups; rename the PC (Settings > System > About > Rename this PC) for a friendlier name.
- Only this PC and devices on a private network (addresses starting 10., 172.16-31. or 192.168.) can open the app.
- Sign-ins travel over the school network without encryption (plain `http`).
- Problems: see `local\run\apache-error.log` and `local\run\php-error.log`. Apache's logs start a new file at 10 MB and keep the 5 newest.
