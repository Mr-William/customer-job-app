# 🖥️ Server Command Cheatsheet

Daily drivers for the job-tracker VPS (Ubuntu + Nginx + Let's Encrypt + PM2 + PostgreSQL + fail2ban).
Run as `deploy` unless a command is prefixed with `sudo`. Replace `yourdomain.com` with your domain.

---

## 1. 30-second health check

```bash
uptime                 # load averages + time since last boot
df -h /                # disk (worry above ~85%)
free -h                # memory — read the "available" column
pm2 list               # jobtracker: online?
systemctl --failed     # any dead services? (should be empty)
curl -sI https://yourdomain.com | head -1   # 200 = healthy
```

## 2. Site is down — triage in this exact order

```bash
pm2 list                                    # 1. Is the app running?
curl -s http://localhost:3000/api/health    # 2. App reachable directly (bypasses nginx)?
systemctl status nginx --no-pager | head    # 3. Is nginx alive?
free -h && df -h /                          # 4. Out of memory or disk?
sudo dmesg | grep -i oom | tail             # 5. Did the kernel kill a process?
pm2 logs jobtracker --lines 50 --nostream   # 6. What did the app say before dying?
```

Reading the symptoms:

| Symptom | Layer |
|---|---|
| `502 Bad Gateway` | app is down (steps 1–2) |
| Total silence, no page | nginx or whole server (steps 3–5) |
| Works on phone data, not at home | your network/DNS — server is fine |
| Slow, then 502s | memory (add swap / bigger VPS) or a stuck DB query |

## 3. The app (PM2) — always as `deploy`, never `sudo pm2`

```bash
pm2 list
pm2 logs jobtracker --lines 100 --nostream
pm2 restart jobtracker
pm2 save        # run after ANY start/delete so the boot list stays correct
```

## 4. Services & system

```bash
systemctl status nginx postgresql fail2ban --no-pager -l
sudo systemctl restart nginx        # (or postgresql / fail2ban)
journalctl -p err --since "1 hour ago" | tail -30   # recent system errors
last -a | head -20                   # recent logins (needs util-linux; see DEPLOY.md)
```

## 5. Security

```bash
# fail2ban
sudo fail2ban-client status
sudo fail2ban-client get nginx-404 banned      # the 404-scanner jail
sudo fail2ban-client get sshd banned
sudo fail2ban-client set nginx-404 unbanip 1.2.3.4   # free a false positive
sudo tail -50 /var/log/fail2ban.log

# SSH brute-force audit
sudo journalctl -u ssh --since "7 days ago" | grep -ci 'failed password'   # count (normal: thousands)
sudo journalctl -u ssh | grep -iE 'accepted (password|publickey)' | tail -20   # every successful login — ALL should be you

# Firewall & listening ports
sudo ufw status
ss -tlnp | grep -E ':22|:80|:443|:3000|:5432'
# expected: 22/80/443 on 0.0.0.0, while 3000 and 5432 are 127.0.0.1 ONLY

# Access log — who's hitting what
sudo tail -50 /var/log/nginx/access.log
sudo grep -c ' 404 ' /var/log/nginx/access.log
```

## 6. Logs

```bash
sudo tail -100 /var/log/nginx/access.log
sudo tail -50  /var/log/nginx/error.log
pm2 logs jobtracker --lines 50 --nostream
du -sh /var/log/nginx ~/.pm2/logs        # check log bloat monthly

# Shrink a bloated LIVE log in place (never rm it while nginx runs):
sudo truncate -s 0 /var/log/nginx/access.log
```

## 7. Database & backups

```bash
# Size
sudo -u postgres psql -c "SELECT pg_size_pretty(pg_database_size('jobtracker_db'));"

# Connection smoke test
sudo -u postgres pg_dump jobtracker_db | head -20

# Manual backup (automatic daily job runs at 02:00 into /var/backups/jobtracker)
pg_dump -U jobtracker jobtracker_db | gzip > ~/backup_$(date +%Y%m%d).sql.gz
```

## 8. Network & SSL

```bash
ss -tlnp                                  # everything listening
sudo certbot certificates                 # cert expiry dates
sudo certbot renew --dry-run              # prove auto-renewal works (do once a month)
curl -sI https://yourdomain.com | head -8 # check security headers
```

## 9. Deploying an app update

```bash
cd ~/customer-job-app
git pull origin main
npm install
npm audit          # fix criticals before continuing
npm run build
pm2 restart jobtracker
pm2 save
curl -sI https://yourdomain.com | head -1   # verify 200
```

## 10. Useful information

```bash
hostname -I                    # server IPs
cat /etc/os-release | head -2  # distro
node -v; nginx -v 2>&1; psql --version; sudo fail2ban-client version
uname -a
df -h && free -h
```

## 11. Maintenance

```bash
sudo reboot                       # clean reboot — every service auto-restores
sudo apt list --upgradable | head # what's pending (unattended-upgrades handles security)
sudo journalctl --vacuum-time=7d  # trim system journal to 7 days
```

---

### The three questions to ask every few weeks

1. `pm2 list` + `curl -sI https://yourdomain.com` — is it healthy?
2. `sudo fail2ban-client status` + `df -h /` — is it defending itself and not filling up?
3. `sudo journalctl -u ssh | grep -i accepted | tail` — is anyone logging in who shouldn't be?