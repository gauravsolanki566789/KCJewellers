ssh root@159.65.145.51
cd /var/www/kcjewellers
./deploy.sh

### 502 Bad Gateway after deploy
Nginx hits **127.0.0.1:3001**; Next must listen there (`client` `npm run start` uses `-p 3001`).

On the VPS:
```bash
pm2 logs kc-frontend --lines 80
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3001/
pm2 restart kc-frontend
# if still 502 or "Could not find BUILD_ID":
KC_FORCE_CLIENT_BUILD=1 ./deploy.sh
```
PM2 template: `ecosystem.kcjewellers.config.cjs` (paths/PORT must match your `.env`).

To add a domain as reseller:
sudo nano /etc/nginx/sites-available/kcjewellers


# FRONTEND - Reseller: Silver Lining Jewels
server {
    server_name silverliningjewels.com www.silverliningjewels.com;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
    listen 443 ssl;
}

sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d gauravsoftwares.tech -d www.gauravsoftwares.tech

command to kill one drive error     
Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue

Database access query :
rm -rf /var/www/kcjewellers/public/uploads/web_products/*

command to access database 
sudo -u postgres psql -d kcjewellers
DELETE FROM web_products WHERE barcode = '100001';

DELETE FROM web_products 
WHERE subcategory_id = 262;

SELECT * FROM web_subcategories;SELECT * FROM web_categories;

# 1. Clean up npm's hidden cache (this can eat gigabytes over time)
npm cache clean --force

# 2. Clear out old PM2 logs
pm2 flush

# 3. Clean up old system journals (keeps only the last 2 days of server logs)
sudo journalctl --vacuum-time=2d

# 4. Remove unused Ubuntu packages
sudo apt-get autoremove -y
sudo apt-get clean

DELETE FROM reseller_erp_stock_pieces
WHERE reseller_user_id = 11
  AND status = 'sold';

Get tally ready for connection : 
F1
Settings
Select Connectivity.
TallyPrime acts as to Server (or Both).
"Enable ODBC" -> Yes.
Set the Port to 9000.
Ctrl + A

Create a customer ledger :
create -> ledger -> customer name type -> sundry debtors -> ctrl+A ( to save)
## ?? License
Proprietary - Gaurav Softwares
---
