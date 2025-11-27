# SSH Manager

A powerful SSH connection and tunnel manager written in TypeScript, providing an interactive command-line interface for managing multiple SSH servers and port forwarding tunnels.

## Features

-   🔐 **Secure SSH Connections** - Connect to SSH servers with password or key-based authentication
-   🚇 **Tunnel Management** - Create and manage multiple SSH tunnels (port forwarding)
-   💾 **Configuration Management** - Save and manage multiple server configurations
-   🔒 **Password Encryption** - Optional encryption for stored passwords using a master password
-   🌍 **Multi-language Support** - Localized interface with language selection
-   🎯 **Interactive CLI** - User-friendly menu-driven interface
-   🔄 **Daemon Mode** - Background daemon for managing tunnels independently

## Installation

### Prerequisites

-   Node.js 18 or higher
-   npm or yarn

### From Source

```bash
# Clone the repository
git clone https://github.com/Strelok-Creative-Unity/ssh-manager.git
cd ssh-manager

# Install dependencies
npm install

# Build the project for your system
npm run build:linux
#or
npm run build:windows
#or
npm run build:macos
```

### Pre-built Binaries

Pre-built executables are available in the `release/` directory:

-   `ssh-manager-linux` - Linux x64
-   `ssh-manager-macos` - macOS ARM64
-   `ssh-manager-win.exe` - Windows x64

## Usage

### Running the Application

#### Development Mode

```bash
npm run dev
```

#### Production Mode

```bash
npm run build:ts
npm start
```

#### Watch Mode (Auto-rebuild)

```bash
npm run watch
```

### First Run

When you first launch SSH Manager, you'll be prompted to set a master password. This password is used to:

-   Encrypt stored SSH passwords (if you choose to encrypt them)
-   Protect your configuration file

**Important:** Remember this password! You'll need it every time you start the application.

### Main Menu

After entering your master password, you'll see the main menu with the following options:

1. **Connect to Server** - Select a saved server to establish an SSH connection
2. **Add Connection** - Add a new SSH server to your configuration
3. **Delete Connection** - Remove a saved server configuration
4. **Manage Tunnels** - Configure and manage SSH tunnels for servers
5. **Change Language** - Switch the interface language
6. **Exit** - Quit the application

### Adding a Server

1. Select "Add Connection" from the main menu
2. Enter the following information:
    - **Name**: A friendly name for this server (e.g., "production-server")
    - **Host**: The server hostname or IP address
    - **Port**: SSH port (default: 22)
    - **Username**: SSH username
    - **Authentication Method**: Choose between password or private key
        - **Password**: Enter the password (you can choose to encrypt it)
        - **Private Key**: Provide the path to your private key file
3. The application will test the connection before saving
4. You can save the connection even if the test fails (useful for offline configuration)

### Connecting to a Server

1. Select a server from the main menu
2. The application will establish an SSH connection
3. You'll be dropped into an interactive SSH shell
4. Press `Ctrl+C` or type `exit` to disconnect and return to the main menu

### Managing Tunnels

SSH tunnels allow you to forward ports from your local machine to a remote server through an SSH connection.

#### Adding a Tunnel

1. Select "Manage Tunnels" from the main menu
2. Choose a server
3. Select "Add Tunnel"
4. Enter tunnel configuration:
    - **Source Port**: Local port to listen on (e.g., 8080)
    - **Destination Host**: Target host on the remote side (e.g., 127.0.0.1)
    - **Destination Port**: Target port on the remote side (e.g., 80)

#### Starting/Stopping Tunnels

1. Go to "Manage Tunnels" → Select a server
2. You'll see a list of configured tunnels with their status
3. Select a tunnel to toggle it (start if stopped, stop if running)

#### Example Use Cases

-   **Local Port Forwarding**: Access a remote web server

    -   Source: `8080`, Destination: `127.0.0.1:80`
    -   Access `http://localhost:8080` to reach the remote server's port 80

-   **Database Access**: Connect to a remote database
    -   Source: `5432`, Destination: `127.0.0.1:5432`
    -   Connect to `localhost:5432` to access the remote PostgreSQL database

### Configuration File

Server configurations are stored in `~/.ssh-manager/config.json`. The file structure is:

```json
{
    "servers": {
        "server-name": {
            "host": "example.com",
            "username": "user",
            "port": 22,
            "password": "plaintext-password",
            "tunnels": [
                {
                    "srcPort": "8080",
                    "dstHost": "127.0.0.1",
                    "dstPort": "80"
                }
            ]
        },
        "encrypted-server": {
            "host": "secure.example.com",
            "username": "admin",
            "port": 22,
            "password": {
                "hash": "encrypted-hash",
                "salt": "salt-value"
            },
            "tunnels": []
        },
        "key-based-server": {
            "host": "key.example.com",
            "username": "user",
            "port": 22,
            "privateKey": "~/.ssh/id_rsa",
            "tunnels": []
        }
    },
    "language": "en"
}
```

#### Password Storage Options

-   **Plaintext**: Store password as-is (not recommended for production)
-   **Encrypted**: Store password encrypted with your master password (recommended)

#### Private Key Authentication

You can use private key authentication by specifying:

-   `privateKey`: Path to your private key file (supports `~` for home directory)

### Install to System (Linux)

After building, you can install the binary to your system:

```bash
npm run build:linux:pub
npm run install:linux
```

This installs `ssh-manager` to `/usr/local/bin/ssh-manager`.

## Architecture

### Components

-   **Main Application** (`src/index.ts`) - Main entry point and menu management
-   **SSH Connection** (`src/ssh/`) - SSH connection handling and shell creation
-   **Tunnel Manager** (`src/daemon/tunnel/`) - Background tunnel management
-   **Daemon** (`src/daemon/`) - Background process for tunnel management
-   **Configuration Manager** (`src/utils/config.ts`) - Configuration file handling
-   **Crypto Manager** (`src/utils/crypto.ts`) - Password encryption/decryption
-   **UI Menu** (`src/ui/menu.ts`) - Interactive menu system

### Daemon Mode

The application runs a background daemon (on port 31337) that manages SSH tunnels independently. This allows tunnels to persist even if the main application is closed.

## Security Considerations

-   **Master Password**: Choose a strong master password and keep it secure
-   **Encrypted Passwords**: Always use encrypted password storage for sensitive servers
-   **Private Keys**: Ensure your private key files have appropriate permissions (600)
-   **Configuration File**: The config file is stored in your home directory with default permissions

## Troubleshooting

### Connection Issues

-   Verify the server hostname/IP and port are correct
-   Check your network connectivity
-   Ensure the SSH service is running on the remote server
-   Verify your credentials (username/password or private key)

### Tunnel Issues

-   Ensure the source port is not already in use
-   Check that the destination host and port are accessible from the remote server
-   Verify the SSH connection to the server is working

### Daemon Issues

-   If the daemon fails to start, check if port 31337 is available
-   Restart the application to reconnect to the daemon

## Development

### Project Structure

```
SSH/
├── src/              # TypeScript source files
├── dist/             # Compiled JavaScript files
├── release/          # Pre-built binaries
└── package.json      # Project configuration
```

### Scripts

-   `npm run build:ts` - Compile TypeScript only
-   `npm run build:check` - Type-check without emitting files
-   `npm run dev` - Run in development mode
-   `npm run watch` - Watch mode for auto-recompilation
-   `npm start` - Run the compiled application

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Authors

-   THError
-   Strelok.js
-   TillSilph
