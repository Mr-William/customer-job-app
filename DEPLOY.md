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

## 🔄 Updating the App (Future)

Whenever you push changes to GitHub:

```bash
cd ~/customer-job-app
git pull origin main
npm install          # Install any new dependencies
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
- [ ] (Optional) Set up fail2ban for SSH brute-force protection:
  ```bash
  sudo apt install -y fail2ban
  sudo systemctl enable fail2ban
  ```
- [ ] (Optional) Set up automated database backups:
  ```bash
  # Add to crontab (crontab -e):
  # 0 2 * * * pg_dump -U jobtracker jobtracker_db > /home/deploy/backups/jobtracker_$(date +\%Y\%m\%d).sql
  ```

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
