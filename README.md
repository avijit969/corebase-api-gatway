# CoreBase API Gateway

CoreBase is a Backend-as-a-Service (BaaS) providing scalable database operations, storage, authentication, and project management. This API Gateway serves as the entry point for all client interactions.

## 📂 Project Structure

```bash
corebase-api-gateway/
├── .github/
│   └── workflows/
│       └── github-actions.yml # CD Pipeline config
├── dbs/                       # Database storage
├── src/
│   ├── controllers/           # Business logic
│   ├── routes/                # route definitions (Hono)
│   ├── utils/                 # Helper functions (Email, etc.)
│   └── index.ts               # Application entry point
├── Dockerfile
├── docker-compose.yml         # Container orchestration
├── API_DOCUMENTATION.md       # API Specification
└── README.md                  # This manual
```

## 🚀 Local Development

1. **Install Dependencies**
   ```bash
   bun install
   ```

2. **Run Locally**
   ```bash
   bun run dev
   ```
   The server will start at `http://localhost:3000`.

---

## ☁️ Deployment Guide (Azure + Ubuntu + Nginx + SSL)

This guide walks you through setting up a production-ready environment on functionality Azure VM.

### Phase 1: Create Azure VM

1.  **Log in to Azure Portal**.
2.  **Create a resource** > **Virtual Machine**.
3.  **Basics**:
    *   **Image**: Ubuntu Server 20.04 LTS or 22.04 LTS.
    *   **Size**: Standard B1s or B2s (depending on load).
    *   **Authentication type**: SSH public key (Download the `.pem` file).
4.  **Networking**:
    *   Allow selected ports: **SSH (22)**, **HTTP (80)**, **HTTPS (443)**.
5.  **Review + create**.

### Phase 2: Log in & Install Dependencies

**1. SSH into your VM:**
   On your local machine, change permissions for the key and connect:
   ```bash
   chmod 400 your-key-name.pem
   ssh -i your-key-name.pem azureuser@<YOUR_VM_PUBLIC_IP>
   ```

**2. Update System:**
   ```bash
   sudo apt update && sudo apt upgrade -y
   ```

**3. Install Docker & Docker Compose:**
   ```bash
    # Add Docker's official GPG key:
    sudo apt update
    sudo apt install ca-certificates curl
    sudo install -m 0755 -d /etc/apt/keyrings
    sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
    sudo chmod a+r /etc/apt/keyrings/docker.asc

    # Add the repository to Apt sources:
    sudo tee /etc/apt/sources.list.d/docker.sources <<EOF
    Types: deb
    URIs: https://download.docker.com/linux/ubuntu
    Suites: $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}")
    Components: stable
    Signed-By: /etc/apt/keyrings/docker.asc
    EOF

    sudo apt update

    sudo apt install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
   ```


**4. Install Nginx:**
   ```bash
   sudo apt install nginx -y
   sudo systemctl start nginx
   sudo systemctl enable nginx
   ```

### Phase 3: Setup GitHub Actions (CD Pipeline)

1.  **Generate SSH Key Pair on Server (Optional but recommended for Git)**:
    If your repo is private, you might need an SSH key added to GitHub Deploy Keys.
    ```bash
    ssh-keygen -t rsa -b 4096 -C "your_email@example.com"
    cat ~/.ssh/id_rsa.pub
    ```
    Add this key to your GitHub Repo > Settings > Deploy Keys.

2.  **Clone the Repository**:
    ```bash
    cd /home/azureuser
    git clone https://github.com/avijit969/corebase-api-gatway.git
    cd corebase-api-gatway
    ```

3.  **Configure GitHub Secrets**:
    Go to your GitHub Repo > Settings > Secrets and variables > Actions. Add:
    *   `AZURE_VM_HOST`: Your VM Public IP.
    *   `AZURE_VM_USERNAME`: `azureuser` (or your chosen username).
    *   `AZURE_VM_SSH_KEY`: Content of the `.pem` private key you downloaded from Azure.

    *Note: The existing `.github/workflows/github-actions.yml` is configured to pull changes and restart docker-compose automatically on push to main.*

### Phase 4: Domain & Nginx Configuration

**1. Point Domain:**
   *   Go to your DNS provider (GoDaddy, Namecheap, Cloudflare, etc.).
   *   Add an **A Record**:
       *   **Host/Name**: `api` (for `api.yourdomain.com`) or `@` (for root).
       *   **Value/IP**: Your Azure VM Public IP.

**2. Configure Nginx Reverse Proxy:**
   Create a config file for your site:
   ```bash
   sudo nano /etc/nginx/sites-available/corebase
   ```

   Paste the following configuration:
   ```nginx
   server {
       server_name api.yourdomain.com; # REPLACE with your actual domain

       location / {
           proxy_pass http://localhost:3000; # Points to Docker container
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
       }
   }
   ```

**3. Enable the Site:**
   ```bash
   sudo ln -s /etc/nginx/sites-available/corebase /etc/nginx/sites-enabled/
   sudo nginx -t # Test configuration
   sudo systemctl restart nginx
   ```

### Phase 5: SSL Certificate (HTTPS)

Secure your API with a free Let's Encrypt SSL certificate.

1.  **Install Certbot:**
    ```bash
    sudo apt install certbot python3-certbot-nginx -y
    ```

2.  **Obtain Certificate:**
    ```bash
    sudo certbot --nginx -d api.yourdomain.com
    ```
    *   Enter your email for renewal notices.
    *   Agree to terms.
    *   Choose option `2` (Redirect) to force HTTPS.

3.  **Auto-Renewal Test:**
    ```bash
    sudo certbot renew --dry-run
    ```

---

## ✅ Summary

Your CoreBase API Gateway is now live!
- **Code**: `https://github.com/avijit969/corebase-api-gatway`
- **Server**: Azure Ubuntu VM
- **Process Manager**: Docker Compose (App + Redis)
- **Reverse Proxy**: Nginx
- **Security**: SSL via Certbot
- **CI/CD**: GitHub Actions auto-deploys on `git push`.
