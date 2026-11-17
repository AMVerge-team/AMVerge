# Flathub Packaging for AMVerge

This folder contains the complete manifest and AppStream metadata required to submit AMVerge to [Flathub](https://flathub.org).

- **Application ID**: `app.amverge.AMVerge`
- **Manifest**: `app.amverge.AMVerge.yml`
- **AppStream Metainfo**: `app.amverge.AMVerge.metainfo.xml`
- **Desktop Entry**: `app.amverge.AMVerge.desktop`
- **Icons**: `icons/`

---

## Testing Locally (Linux)

To test the Flatpak build locally on a Linux machine with `flatpak` and `flatpak-builder` installed:

```bash
# 1. Install Flatpak GNOME 47 runtime and SDK
flatpak install flathub org.gnome.Platform//47 org.gnome.Sdk//47

# 2. Build and install locally
cd flatpak
flatpak-builder --user --install --force-clean build-dir app.amverge.AMVerge.yml

# 3. Run AMVerge Flatpak
flatpak run app.amverge.AMVerge
```

---

## Submitting to Flathub

1. **Fork the Flathub Repository**:
   Visit [https://github.com/flathub/flathub](https://github.com/flathub/flathub) and click **Fork**.

2. **Create a Submission Branch**:
   ```bash
   git clone https://github.com/<your-username>/flathub.git
   cd flathub
   git checkout -b add-app.amverge.AMVerge
   ```

3. **Copy the Flatpak Files**:
   Copy the contents of this `flatpak/` folder directly to the root of your `flathub` branch:
   - `app.amverge.AMVerge.yml`
   - `app.amverge.AMVerge.metainfo.xml`
   - `app.amverge.AMVerge.desktop`
   - `icons/`

4. **Open a Pull Request**:
   Commit, push, and open a PR on `flathub/flathub` titled:
   `Add app.amverge.AMVerge`

   Flathub's automated bot (`@flathubbot`) will trigger a test build and post a test install link. Once reviewed by a Flathub maintainer, it will be merged and published worldwide.
