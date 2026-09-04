# 🚀 Deployment Guide — Digital Revolution Job Tracker

**Target:** Ubuntu Server 26.04 (fresh install)  
**Access:** Custom domain with HTTPS  
**Source:** Git clone from GitHub  

---

## Prerequisites

Before you start, make sure you have:

- A domain name pointing to your server's public IP (A record, e.g. `jobs.yourdomain.com`)
- Your GitHub repo is up to date:
  ```bash
  git push origin arena/019fba35-customer-job-app
  ```
- SSH access to your Ubuntu server

---

## Step 1 — Initial Server Setup

SSH into your server and run the basics:

```bash
# Update the system
sudo apt update && sudo apt upgrade -y

# Install essential tools
sudo apt install -y curl git ufw

# Create a non-root user (skip if you already logged in as one)
sudo adduser deploy
sudo usermod -aG sudo deploy
su - deploy
```

### Firewall — allow SSH, HTTP, HTTPS

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status
```

---

## Step 2 — Install Node.js 22 LTS

```bash
# Install NodeSource setup script and install Node.js 22
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

# Verify
node -v   # should show v22.x
npm -v
```

---

## Step 3 — Install PostgreSQL

```bash
sudo apt install -y postgresql postgresql-contrib

# Start and enable PostgreSQL
sudo systemctl enable postgresql
sudo systemctl start postgresql
```

### Create database and user

```bash
sudo -u postgres psql
```

Run these SQL commands inside the psql prompt:

```sql
CREATE DATABASE jobtracker_db;
CREATE USER jobtracker WITH ENCRYPTED PASSWORD 'CHANGE_THIS_TO_A_STRONG_PASSWORD';
GRANT ALL PRIVILEGES ON DATABASE jobtracker_db TO jobtracker;

-- Required for Drizzle ORM to manage schema
\c jobtracker_db
GRANT ALL ON SCHEMA public TO jobtracker;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO jobtracker;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO jobtracker;

\q
```

> ⚠️ **Replace `CHANGE_THIS_TO_A_STRONG_PASSWORD`** with a strong, unique password.

---

## Step 4 — Clone the Repository

```bash
cd ~
git clone https://github.com/Mr-William/customer-job-app.git
cd customer-job-app
```

---

## Step 5 — Configure Environment Variables

```bash
cd ~/customer-job-app
cp .env.example .env
nano .env
```

Edit the file to match your setup:

```env
DATABASE_URL=postgresql://jobtracker:YOUR_STRONG_PASSWORD@localhost:5432/jobtracker_db
JWT_SECRET=generate-a-long-random-string-here
NEXT_PUBLIC_APP_URL=https://jobs.yourdomain.com

# Default admin account (auto-created on first run)
DEFAULT_ADMIN_EMAIL=admin@yourdomain.com
DEFAULT_ADMIN_PASSWORD=ChangeMe_StrongPassword_123!
DEFAULT_ADMIN_FIRST_NAME=System
DEFAULT_ADMIN_LAST_NAME=Admin

# SMTP Email Configuration (for user approval workflow)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password

# Where approval request emails are sent
ADMIN_EMAIL=admin@yourdomain.com
```

Generate a secure JWT secret:

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

> ⚠️ Replace `YOUR_STRONG_PASSWORD`, the JWT secret, domain URL, and admin credentials with your own values.

### SMTP Email Setup (Approval Workflow)

When a new user registers, the app sends an email to the admin with Approve/Deny links. Configure SMTP so these emails are actually delivered.

**Option A — Gmail (easiest)**

1. Enable 2FA on your Google account at https://myaccount.google.com/security
2. Generate an App Password at https://myaccount.google.com/apppasswords
3. Use these settings in your `.env`:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-16-char-app-password
ADMIN_EMAIL=your-email@gmail.com
```

**Option B — Your domain's email**

If your domain registrar provides email hosting:

```env
SMTP_HOST=mail.yourdomain.com
SMTP_PORT=587
SMTP_USER=jobs@yourdomain.com
SMTP_PASS=your-email-password
ADMIN_EMAIL=you@yourdomain.com
```

**Option C — Free SMTP relay services**

| Provider | Free Tier | Sign Up |
|---|---|---|
| Brevo (Sendinblue) | 300 emails/day | https://www.brevo.com |
| SendGrid | 100 emails/day | https://sendgrid.com |
| Mailgun | 100 emails/day | https://www.mailgun.com |

> **Without SMTP configured**, the app still works — approval/denial URLs are logged to the server console instead. You can copy them from `pm2 logs jobtracker` and paste them in your browser to approve users manually.

---

## Step 6 — Install Dependencies & Set Up Database

```bash
cd ~/customer-job-app
npm install
```

### Generate and push the database schema with Drizzle

```bash
# Generate migration files from the schema
npx drizzle-kit generate

# Push the schema directly to the database
npx drizzle-kit migrate
```

> If `drizzle-kit migrate` doesn't apply (it looks for a migrations folder), you can alternatively use `npx drizzle-kit push` which syncs the schema directly.

---

## Step 7 — Build the Application

```bash
npm run build
```

This creates the optimized production build in `.next/`.

---

## Step 8 — Set Up PM2 (Process Manager)

PM2 keeps your app running and auto-restarts it on crashes or server reboots.

```bash
# Install PM2 globally
sudo npm install -g pm2

# Start the app
pm2 start npm --name "jobtracker" -- start

# Save PM2 config and set up auto-start on boot
pm2 save
pm2 startup
# ^ Copy and run the command it outputs
```

> ⚠️ **Always manage PM2 as the `deploy` user — never `sudo pm2`.** PM2 keeps a separate process table per user: an app started under root is invisible to `deploy` (`pm2 delete` says "not found"), and `pm2 startup` registers the boot service under whichever user ran it. If you ever see "Process or Namespace not found", check `sudo pm2 list` — the process is probably under the other user. Fix: delete it from that user's PM2, then start it, `pm2 save`, and `pm2 startup` as `deploy`.

### Useful PM2 commands

```bash
pm2 status            # See running apps
pm2 logs jobtracker   # View logs
pm2 restart jobtracker  # Restart after updates
pm2 stop jobtracker   # Stop the app
```

---

## Step 9 — Install & Configure Nginx (Reverse Proxy)

```bash
sudo apt install -y nginx

sudo systemctl enable nginx
sudo systemctl start nginx
```

Create a site config:

```bash
sudo nano /etc/nginx/sites-available/jobtracker
```

Paste this configuration (replace `jobs.yourdomain.com` with your domain):

```nginx
server {
    listen 80;
    server_name jobs.yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 90s;
    }
}
```

Enable the site and test:

```bash
sudo ln -s /etc/nginx/sites-available/jobtracker /etc/nginx/sites-enabled/
sudo nginx -t           # Test config
sudo systemctl reload nginx
```

At this point, you can test that the app is working over HTTP at `http://jobs.yourdomain.com`.

---

## Step 10 — Set Up HTTPS with Let's Encrypt

```bash
sudo apt install -y certbot python3-certbot-nginx

# Obtain SSL certificate (automatically configures Nginx)
sudo certbot --nginx -d jobs.yourdomain.com

# Verify auto-renewal works
sudo certbot renew --dry-run
```

Certbot automatically modifies your Nginx config to handle HTTPS and sets up a cron/timer for auto-renewal.

---

## Step 11 — Verify Everything Works

1. Visit **https://jobs.yourdomain.com** in your browser
2. Log in with the default admin credentials from your `.env` file
3. Test adding a customer and a job
4. Check PM2 logs for any errors: `pm2 logs jobtracker`

---

## 🛡️ Security Hardening (Recommended)

Your server's public IP is scanned continuously (observed in access logs: `.git`/`cgi-bin`/solr/onvif probes, PHP RCE attempts, mining-pool protocol probes, SSH banner grabs). Most of it is automated noise, but close the common gaps below.

### 1. Verify nothing got in (do this first, ~5 min)

```bash
# Were any suspicious requests actually SERVED (200/201/3xx)?
grep -E '" (200|201|30[12]) ' /var/log/nginx/access.log \
  | grep -Ei '\.git|\.env|cgi-bin|onvif|solr|allow_url_include|auto_prepend|mining\.subscribe'

# Anyone successfully SSH in who isn't you?
sudo last -a | head -20
sudo lastb | head -20                      # failed login attempts
sudo tail -100 /var/log/auth.log

# Are secrets reachable from the web? (both must return 404)
curl -sI https://jobs.yourdomain.com/.env | head -1
curl -sI https://jobs.yourdomain.com/.git/config | head -1
```

### 2. SSH hardening + fail2ban

```bash
# From your local machine first, so you don't lock yourself out:
ssh-copy-id deploy@SERVER_IP
```

Edit `/etc/ssh/sshd_config` (leave a second terminal open while testing):

```
PasswordAuthentication no
PermitRootLogin prohibit-password
```

```bash
sudo systemctl reload sshd && ssh deploy@SERVER_IP   # confirm login still works
```

Install fail2ban with jails that match the scanner behavior in your logs:

```bash
sudo apt install -y fail2ban
sudo tee /etc/fail2ban/jail.local >/dev/null <<'EOF'
[sshd]
enabled  = true
maxretry = 5
bantime  = 1h
findtime = 10m

[nginx-botsearch]
enabled  = true
filter   = nginx-botsearch
maxretry = 10
bantime  = 1d
findtime = 1h

[nginx-bad-request]
enabled  = true
filter   = nginx-bad-request
maxretry = 5
bantime  = 1d
findtime = 1h

[nginx-404]
enabled  = true
filter   = nginx-404
logpath  = /var/log/nginx/access.log
maxretry = 10
findtime = 1h
bantime  = 1d
EOF
```

The stock nginx filters read `error.log`, but with a full-proxy setup 404s never reach it (the app returns them, nginx passes them through) — so the `nginx-404` jail needs a custom filter that counts 404s in the **access log**:

```bash
sudo tee /etc/fail2ban/filter.d/nginx-404.conf >/dev/null <<'EOF'
[Definition]

failregex = ^<HOST> .*"[A-Z]+ \S+ HTTP/[0-9.]+" 404 \d+

ignoreregex = ^<HOST> .*"(GET|HEAD) /favicon\.ico[^"]*" 404 \d+
EOF
# Verify no tabs/stray characters sneaked in (a corrupted file silently matches 0):
cat -A /etc/fail2ban/filter.d/nginx-404.conf
```

> ⚠️ **The `.*` between `<HOST>` and the request is deliberate, not laziness.** fail2ban ≥ 1.0's date-template handling breaks patterns that try to match *through* the bracketed timestamp (`\[[^\]]+\]` versions match 0 lines on some builds) — skipping the timestamp with `.*` works on every version. Don't "fix" it back.
>
> ⚠️ If your paste corrupts multi-line blocks (tabs/`^I` or stray `$` show in `cat -A`), rewrite the file with this paste-proof one-liner instead:
>
> ```bash
> echo 'W0RlZmluaXRpb25dCgpmYWlscmVnZXggPSBePEhPU1Q+IC4qIltBLVpdKyBcUysgSFRUUC9bMC05Ll0rIiA0MDQgXGQrCgppZ25vcmVyZWdleCA9IF48SE9TVD4gLioiKEdFVHxIRUFEKSAvZmF2aWNvblwuaWNvW14iXSoiIDQwNCBcZCsK' | base64 -d | sudo tee /etc/fail2ban/filter.d/nginx-404.conf > /dev/null
> ```
>
> Always verify a custom filter works before relying on it: `sudo fail2ban-regex /var/log/nginx/access.log /etc/fail2ban/filter.d/nginx-404.conf` — the final `matched:` count must be > 0.

```bash
sudo systemctl enable --now fail2ban
sudo fail2ban-client status    # expect 4 jails: sshd, nginx-botsearch, nginx-bad-request, nginx-404
```

`nginx-botsearch`/`nginx-bad-request` ban exploit strings and malformed requests; **`nginx-404` is the workhorse** — it's the jail that catches the repeated-404 scanner noise. Check its catches anytime: `sudo fail2ban-client get nginx-404 banned`

### 3. Harden Nginx

Replace `/etc/nginx/sites-available/jobtracker` with this (adjust domain; certbot cert paths assume the domain is `jobs.yourdomain.com`):

```nginx
# Rate-limit zones (http context — fine in this included file)
limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
limit_req_zone $binary_remote_addr zone=auth:10m rate=5r/m;

server {
    listen 80;
    server_name jobs.yourdomain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name jobs.yourdomain.com;

    ssl_certificate     /etc/letsencrypt/live/jobs.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/jobs.yourdomain.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    server_tokens off;
    client_max_body_size 10m;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options DENY always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;

    # Secrets & app internals: answer 404 without ever touching the app
    location ~* /\.(git|env|next|npmrc|dockerignore|dockerfile) {
        return 404;
    }
    # Known scanner targets: stop them at the proxy
    location ~* ^/(cgi-bin|solr|onvif|webui|HNAP11|odinsvr|evox) {
        return 404;
    }

    # Login/register: strict limit to blunt credential brute-force
    location ~* ^/api/auth/(login|register) {
        limit_req zone=auth burst=5 nodelay;
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 90s;
    }

    location / {
        limit_req zone=api burst=20 nodelay;
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 90s;
    }
}
```

```bash
sudo nginx -t && sudo systemctl reload nginx
```

### 4. Automatic updates — and rebooting only when needed

**Option A (recommended): `unattended-upgrades`.** Security updates install themselves every day, and the server reboots **only when an update requires it** (kernel, etc.) — not every night:

```bash
sudo apt install -y unattended-upgrades needrestart
sudo dpkg-reconfigure -plow unattended-upgrades   # accept defaults

# Auto-reboot at 03:00, but ONLY if an installed update set /var/run/reboot-required
sudo tee /etc/apt/apt.conf.d/99auto-reboot >/dev/null <<'EOF'
Unattended-Upgrade::Automatic-Reboot "true";
Unattended-Upgrade::Automatic-Reboot-Time "03:00";
EOF
```

Check what it's doing anytime: `less /var/log/unattended-upgrades/unattended-upgrades.log`

**Option B (optional, on top of A): nightly full upgrade + conditional reboot.** If you want *all* updates (not just security) applied on a schedule:

Create `/home/deploy/scripts/nightly-upgrade.sh`:

```bash
#!/bin/bash
# Nightly: upgrade everything, prune old journal logs, reboot ONLY if required.
set -uo pipefail
exec >> /var/log/nightly-upgrade.log 2>&1
echo "=== $(date) ==="
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get -y -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold" upgrade
apt-get -y autoremove --purge
journalctl --vacuum-time=7d
if [ -f /var/run/reboot-required ]; then
  echo "Reboot required — rebooting. (nginx, postgres, fail2ban, and the PM2 app all auto-restore)"
  systemctl reboot
else
  echo "No reboot needed."
fi
```

```bash
sudo chmod +x /home/deploy/scripts/nightly-upgrade.sh
# Run it ONCE manually first and watch it — don't schedule something untested
sudo /home/deploy/scripts/nightly-upgrade.sh
# Then schedule as root: sudo crontab -e
# 0 2 * * * /home/deploy/scripts/nightly-upgrade.sh
```

Notes for either option:

- During any reboot the site is down ~1–2 minutes (PM2/nginx/Postgres/fail2ban all come back on their own — you've already set that up).
- `--force-confdef/--force-confold` keeps upgrades from hanging on config-file prompts.
- After any reboot: `pm2 list` (jobtracker online), `sudo fail2ban-client status`, and hit the site.
- This is for the **OS**. Updating the **app** (git pull → build → `pm2 restart`) is a separate script — ask if you want one of those too.

### 5. Credentials & service audit

```bash
# PostgreSQL must be localhost-only — output should be 127.0.0.1:5432, NOT 0.0.0.0:5432
sudo ss -tlnp | grep 5432

# .env must not be world-readable
cd ~/customer-job-app && chown deploy:deploy .env && chmod 600 .env
```

Check your `.env`:

- [ ] `DEFAULT_ADMIN_PASSWORD` is **not** `ChangeMe123!` (the admin is auto-created on first run — if you ever logged in with the default, change it in the dashboard)
- [ ] `JWT_SECRET` is a long random string, not `change-this-secret`
- [ ] DB user is `jobtracker` with a strong password, not `postgres:postgres`
- [ ] `NEXT_PUBLIC_APP_URL` is `https://jobs.yourdomain.com`, not `http://localhost:3000`
- [ ] SMTP uses a Gmail **app password** (2FA enabled), not your main account password

### 6. Backups (daily, keep 14 days)

```bash
sudo mkdir -p /var/backups/jobtracker && sudo chown deploy /var/backups/jobtracker
```

As the `deploy` user, `crontab -e`:

```
0 2 * * * pg_dump -U jobtracker jobtracker_db | gzip > /var/backups/jobtracker/db_$(date +\%Y\%m\%d).sql.gz && find /var/backups/jobtracker -name 'db_*.sql.gz' -mtime +14 -delete
```

### 7. Optional: hide the origin IP

If the IP stays under fire, put the site behind Cloudflare (free tier) and update the DNS A record to Cloudflare's. The scanners in the logs are targeting your public IP directly; a CDN absorbs that traffic.

---

## 🔄 Updating the App (Future)

Whenever you push changes to GitHub:

```bash
cd ~/customer-job-app
git pull origin main
npm install          # Install any new dependencies
npm audit            # Check for known vulnerable packages (fix criticals before deploying)
npm run build        # Rebuild
pm2 restart jobtracker  # Restart with new code
```

---

## 🔒 Security Checklist

- [x] Firewall (UFW) enabled — only ports 22, 80, 443 open
- [x] Strong database password set
- [x] JWT secret is a random 64+ byte hex string
- [x] Admin password changed from default
- [x] HTTPS enabled with Let's Encrypt
- [x] Non-root user running the app
- [ ] (Recommended) Complete the **Security Hardening** section above (fail2ban, hardened Nginx, auto-updates, credential audit, backups):
  - [ ] fail2ban running with `sshd` + `nginx-botsearch` jails
  - [ ] Hardened Nginx config (rate limiting, security headers, 404s for scanner paths)
  - [ ] `unattended-upgrades` installed
  - [ ] `.env` audited (admin password, JWT secret, DB user, app URL) and `chmod 600`
  - [ ] PostgreSQL confirmed bound to `127.0.0.1` only
  - [ ] Daily `pg_dump` backup in place (14-day retention)

---

## 📁 File Structure on Server

```
/home/deploy/
└── customer-job-app/
    ├── .env                  ← Your secrets (never commit this!)
    ├── .next/                ← Built production output
    ├── node_modules/
    ├── src/
    ├── package.json
    └── ...
```

---

## Troubleshooting

| Problem | Fix |
|---|---|
| App won't start | Check `pm2 logs jobtracker` for errors |
| Database connection error | Verify `DATABASE_URL` in `.env` matches your PostgreSQL credentials |
| 502 Bad Gateway | Ensure PM2 is running (`pm2 status`) and Nginx proxy is pointing to port 3000 |
| Domain not resolving | Check DNS A record points to your server's public IP |
| SSL certificate error | Run `sudo certbot renew --force-renewal` |
| Permission denied on clone | Use HTTPS URL or set up SSH keys for GitHub |
| Drizzle migration fails | Ensure the PostgreSQL user has GRANT ALL on the database and schema |
