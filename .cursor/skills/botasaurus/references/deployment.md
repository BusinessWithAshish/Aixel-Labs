# Deployment

## Docker

Use the Botasaurus Starter Template which includes Dockerfile and Docker Compose:

```bash
git clone https://github.com/omkarcloud/botasaurus-starter my-botasaurus-project
cd my-botasaurus-project
docker-compose build && docker-compose up
```

## Gitpod

Benefits: 8-core machine with ~180 Mbps internet speed.

1. Visit [gitpod.io/#https://github.com/omkarcloud/botasaurus-starter](https://gitpod.io/#https://github.com/omkarcloud/botasaurus-starter) and sign up with GitHub
2. Select Large 8 Core, 16 GB RAM machine
3. Run `python main.py` in terminal

**Note**: Gitpod shuts down after ~30 minutes of inactivity. Not suitable for long-running tasks. Interact with the environment every 30 minutes to keep it alive.

## Google Colab

1. Install Chrome and Botasaurus:

```python
! apt-get update
! wget https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
! apt-get install -y lsof wget gnupg2 apt-transport-https ca-certificates software-properties-common adwaita-icon-theme alsa-topology-conf alsa-ucm-conf at-spi2-core dbus-user-session dconf-gsettings-backend dconf-service fontconfig fonts-liberation glib-networking glib-networking-common glib-networking-services gsettings-desktop-schemas gtk-update-icon-cache hicolor-icon-theme libasound2 libasound2-data libatk-bridge2.0-0 libatk1.0-0 libatk1.0-data libatspi2.0-0 libauthen-sasl-perl libavahi-client3 libavahi-common-data libavahi-common3 libcairo-gobject2 libcairo2 libclone-perl libcolord2 libcups2 libdata-dump-perl libdatrie1 libdconf1 libdrm-amdgpu1 libdrm-common libdrm-intel1 libdrm-nouveau2 libdrm-radeon1 libdrm2 libencode-locale-perl libepoxy0 libfile-basedir-perl libfile-desktopentry-perl libfile-listing-perl libfile-mimeinfo-perl libfont-afm-perl libfontenc1 libgbm1 libgdk-pixbuf-2.0-0 libgdk-pixbuf2.0-bin libgdk-pixbuf2.0-common libgl1 libgl1-mesa-dri libglapi-mesa libglvnd0 libglx-mesa0 libglx0 libgraphite2-3 libgtk-3-0 libgtk-3-bin libgtk-3-common libharfbuzz0b libhtml-form-perl libhtml-format-perl libhtml-parser-perl libhtml-tagset-perl libhtml-tree-perl libhttp-cookies-perl libhttp-daemon-perl libhttp-date-perl libhttp-message-perl libhttp-negotiate-perl libice6 libio-html-perl libio-socket-ssl-perl libio-stringy-perl libipc-system-simple-perl libjson-glib-1.0-0 libjson-glib-1.0-common liblcms2-2 libllvm11 liblwp-mediatypes-perl liblwp-protocol-https-perl libmailtools-perl libnet-dbus-perl libnet-http-perl libnet-smtp-ssl-perl libnet-ssleay-perl libnspr4 libnss3 libpango-1.0-0 libpangocairo-1.0-0 libpangoft2-1.0-0 libpciaccess0 libpixman-1-0 libproxy1v5 librest-0.7-0 librsvg2-2 librsvg2-common libsensors-config libsensors5 libsm6 libsoup-gnome2.4-1 libsoup2.4-1 libtext-iconv-perl libthai-data libthai0 libtie-ixhash-perl libtimedate-perl libtry-tiny-perl libu2f-udev liburi-perl libvte-2.91-0 libvte-2.91-common libvulkan1 libwayland-client0 libwayland-cursor0 libwayland-egl1 libwayland-server0 libwww-perl libwww-robotrules-perl libx11-protocol-perl libx11-xcb1 libxaw7 libxcb-dri2-0 libxcb-dri3-0 libxcb-glx0 libxcb-present0 libxcb-randr0 libxcb-render0 libxcb-shape0 libxcb-shm0 libxcb-sync1 libxcb-xfixes0 libxcomposite1 libxcursor1 libxdamage1 libxext6 libxfixes3 libxft2 libxi6 libxinerama1 libxkbcommon0 libxkbfile1 libxml-parser-perl libxml-twig-perl libxml-xpathengine-perl libxmu6 libxmuu1 libxrandr2 libxrender1 libxshmfence1 libxt6 libxtst6 libxv1 libxxf86dga1 libxxf86vm1 libz3-4 mesa-vulkan-drivers perl-openssl-defaults shared-mime-info termit x11-common x11-utils xdg-utils xvfb
! dpkg -i google-chrome-stable_current_amd64.deb
! python -m pip install botasaurus
```

2. Test:

```python
from botasaurus.browser import browser, Driver

@browser
def scrape_heading_task(driver: Driver, data):
    driver.google_get("https://www.g2.com/products/jenkins/reviews?page=5", bypass_cloudflare=True)
    heading = driver.get_text('.product-head__title [itemprop="name"]')
    driver.save_screenshot()
    return heading

scrape_heading_task()
```

## Local vs Cloud Scraping

**Prefer local** for most tasks:
- Fewer setup steps
- Saves time and costs
- Quick bug fixes

**Use cloud** when:
- Tasks longer than 5 days
- Scraping terabytes of data
- Recurring monthly scrapes
- Slow internet or data caps

Cloud is significantly faster due to superior internet speeds (10x+ faster than home Wi-Fi).

## Data Scraper in Virtual Machine

### 1. Prepare Scraper

1. Use Botasaurus Starter Template
2. For large datasets, use memory-efficient formats (e.g., `ndjson`)
3. Add dependencies to `requirements.txt`
4. Push to GitHub

### 2. Set Up VM

1. Create Google Cloud Account ($300 credit for 3 months)

2. Go to [Google Click to Deploy](https://console.cloud.google.com/marketplace/product/click-to-deploy-images/nodejs), configure:
   ```
   Zone: us-central1-a
   Series: N1
   Machine Type: n1-standard-2 (2 vCPU, 1 core, 7.5 GB memory)
   Boot Disk Type: Standard persistent disk
   Boot disk size: 20 GB
   ```

3. SSH into VM from [VM Instances](https://console.cloud.google.com/compute/instances)

4. Install Botasaurus:
   ```bash
   curl -sL https://raw.githubusercontent.com/omkarcloud/botasaurus/master/vm-scripts/install-bota.sh | bash
   ```

5. Install scraper:
   ```bash
   python3 -m bota install-scraper --repo-url https://github.com/omkarcloud/botasaurus-starter
   ```

### VM Notes

- `main.py` is the entry point
- Headful browser needs virtual display: `@browser(enable_xvfb_virtual_display=True)`
- Default: 3 retries on failure. Configure: `--max-retry=5` or `--max-retry=unlimited`
- Check logs: `journalctl -u botasaurus-starter.service -b`

### Download Data

1. Download from VM directly
2. Upload to S3: `bt.upload_to_s3('data.json', 'my-bucket', "KEY", "SECRET")`

### Stop Scraper (for recurring scrapes)

Stop VM from [VM Instances](https://console.cloud.google.com/compute/instances). Only storage costs (~$0.4/month for 10GB).

To restart: Start VM → SSH → delete caches if needed → `shutdown -r now`

### Delete Scraper

Go to [Deployments](https://console.cloud.google.com/products/solutions/deployments) → Delete deployment.

## UI Scraper in Virtual Machine

### Setup

1. Create Google Cloud Account

2. Open [Google Cloud Console](https://console.cloud.google.com/welcome?cloudshell=true) → Cloud Shell:
   ```bash
   python -m pip install bota
   python -m bota create-ip
   ```
   Enter VM name (e.g., "pikachu") and region (default: us-central1).

3. Go to [Google Click to Deploy](https://console.cloud.google.com/marketplace/product/click-to-deploy-images/nodejs), configure:
   ```
   Zone: us-central1-a
   Series: N1
   Machine Type: n1-standard-2 (2 vCPU, 1 core, 7.5 GB memory)
   Boot Disk Type: Standard persistent disk
   Boot disk size: 20 GB
   Network Interface [External IP]: pikachu-ip
   ```

4. SSH into VM

5. Install:
   ```bash
   curl -sL https://raw.githubusercontent.com/omkarcloud/botasaurus/master/vm-scripts/install-bota.sh | bash
   ```

6. Install UI scraper:
   ```bash
   python3 -m bota install-ui-scraper --repo-url https://github.com/omkarcloud/botasaurus-starter
   ```

UI scraper runs indefinitely at the printed link. Check logs: `journalctl -u backend.service -b`

### Delete UI Scraper

1. Delete static IP:
   ```bash
   python -m bota delete-ip
   ```
   Or delete all IPs: `python -m bota delete-all-ips`

2. Delete deployment from [Deployments](https://console.cloud.google.com/products/solutions/deployments)

## Kubernetes

For large-scale scraping, see: [run-scraper-in-kubernetes.md](https://github.com/omkarcloud/botasaurus/blob/master/run-scraper-in-kubernetes.md)
