#!/bin/sh
# PVP Git Hooks Installation Script
# Installs git hooks and sets up the PVP-Git bridge service

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
HOOKS_DIR="$SCRIPT_DIR/hooks"
PVP_DIR="$HOME/.pvp"
PVP_BIN_DIR="$HOME/.local/bin"

# Parse arguments
INSTALL_MODE="user"
GIT_REPO_PATH=""
FORCE=false
BRIDGE_ONLY=false
HOOKS_ONLY=false

print_usage() {
    echo "Usage: $0 [options]"
    echo ""
    echo "Options:"
    echo "  -r, --repo PATH     Install hooks to specific git repository"
    echo "  -g, --global        Install hooks globally (via git template)"
    echo "  -f, --force         Overwrite existing hooks"
    echo "  -b, --bridge-only   Only install the bridge service"
    echo "  -h, --hooks-only    Only install git hooks"
    echo "  --help              Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0                           # Interactive installation"
    echo "  $0 -r /path/to/repo          # Install to specific repo"
    echo "  $0 -g                        # Global template installation"
    echo "  $0 -f -r .                   # Force install to current repo"
}

while [ $# -gt 0 ]; do
    case "$1" in
        -r|--repo)
            GIT_REPO_PATH="$2"
            shift 2
            ;;
        -g|--global)
            INSTALL_MODE="global"
            shift
            ;;
        -f|--force)
            FORCE=true
            shift
            ;;
        -b|--bridge-only)
            BRIDGE_ONLY=true
            shift
            ;;
        -h|--hooks-only)
            HOOKS_ONLY=true
            shift
            ;;
        --help)
            print_usage
            exit 0
            ;;
        *)
            echo "${RED}Unknown option: $1${NC}"
            print_usage
            exit 1
            ;;
    esac
done

# Print banner
echo ""
echo "${BLUE}╔════════════════════════════════════════════╗${NC}"
echo "${BLUE}║     PVP Git Hooks Installation Script      ║${NC}"
echo "${BLUE}╚════════════════════════════════════════════╝${NC}"
echo ""

# Check prerequisites
check_prerequisites() {
    echo "${YELLOW}Checking prerequisites...${NC}"

    # Check for git
    if ! command -v git >/dev/null 2>&1; then
        echo "${RED}Error: git is not installed${NC}"
        exit 1
    fi
    echo "  ${GREEN}✓${NC} git found"

    # Check for Node.js (for bridge service)
    if ! "$HOOKS_ONLY" && ! command -v node >/dev/null 2>&1; then
        echo "${YELLOW}  ⚠ Node.js not found (required for bridge service)${NC}"
        echo "    Bridge service will not be installed."
        BRIDGE_ONLY=false
    else
        echo "  ${GREEN}✓${NC} Node.js found"
    fi

    # Check for hooks source
    if ! "$BRIDGE_ONLY" && [ ! -d "$HOOKS_DIR" ]; then
        echo "${RED}Error: Hooks directory not found at $HOOKS_DIR${NC}"
        exit 1
    fi
    echo "  ${GREEN}✓${NC} Hooks directory found"

    echo ""
}

# Create PVP directories
setup_directories() {
    echo "${YELLOW}Setting up PVP directories...${NC}"

    mkdir -p "$PVP_DIR"
    mkdir -p "$PVP_BIN_DIR"

    echo "  ${GREEN}✓${NC} Created $PVP_DIR"
    echo "  ${GREEN}✓${NC} Created $PVP_BIN_DIR"
    echo ""
}

# Install hooks to a specific repository
install_to_repo() {
    repo_path="$1"

    # Find git directory
    if [ -d "$repo_path/.git" ]; then
        git_dir="$repo_path/.git"
    elif [ -d "$repo_path" ] && git -C "$repo_path" rev-parse --git-dir >/dev/null 2>&1; then
        git_dir=$(git -C "$repo_path" rev-parse --git-dir)
        # Make absolute if relative
        case "$git_dir" in
            /*) ;;
            *) git_dir="$repo_path/$git_dir" ;;
        esac
    else
        echo "${RED}Error: $repo_path is not a git repository${NC}"
        return 1
    fi

    hooks_dest="$git_dir/hooks"

    echo "${YELLOW}Installing hooks to $hooks_dest${NC}"

    for hook in prepare-commit-msg post-commit pre-push; do
        src="$HOOKS_DIR/$hook"
        dest="$hooks_dest/$hook"

        if [ -f "$dest" ] && ! "$FORCE"; then
            echo "  ${YELLOW}⚠${NC} $hook exists (use -f to overwrite)"
        else
            if [ -f "$src" ]; then
                cp "$src" "$dest"
                chmod +x "$dest"
                echo "  ${GREEN}✓${NC} Installed $hook"
            fi
        fi
    done

    # Copy config example if not exists
    config_dest="$repo_path/.pvp-git.config.json"
    if [ ! -f "$config_dest" ]; then
        example_config="$SCRIPT_DIR/pvp-git.config.example.json"
        if [ -f "$example_config" ]; then
            cp "$example_config" "$config_dest"
            echo "  ${GREEN}✓${NC} Created config template at $config_dest"
        fi
    fi

    echo ""
}

# Install hooks globally via git template
install_global() {
    template_dir="$HOME/.git-template"
    hooks_template="$template_dir/hooks"

    echo "${YELLOW}Installing hooks globally via git template...${NC}"

    mkdir -p "$hooks_template"

    for hook in prepare-commit-msg post-commit pre-push; do
        src="$HOOKS_DIR/$hook"
        dest="$hooks_template/$hook"

        if [ -f "$dest" ] && ! "$FORCE"; then
            echo "  ${YELLOW}⚠${NC} $hook exists (use -f to overwrite)"
        else
            if [ -f "$src" ]; then
                cp "$src" "$dest"
                chmod +x "$dest"
                echo "  ${GREEN}✓${NC} Installed $hook"
            fi
        fi
    done

    # Set git config
    git config --global init.templateDir "$template_dir"
    echo "  ${GREEN}✓${NC} Configured git to use template: $template_dir"

    echo ""
    echo "${BLUE}Note:${NC} New repositories will automatically get these hooks."
    echo "For existing repos, run: git init (it's safe on existing repos)"
    echo ""
}

# Install bridge service
install_bridge() {
    echo "${YELLOW}Installing PVP Git Bridge Service...${NC}"

    bridge_src="$SCRIPT_DIR/bridge"
    bridge_dest="$PVP_DIR/git-bridge"

    # Copy bridge files
    mkdir -p "$bridge_dest"
    cp -r "$bridge_src"/* "$bridge_dest/" 2>/dev/null || true

    # Create launcher script
    launcher="$PVP_BIN_DIR/pvp-git-bridge"
    cat > "$launcher" << 'LAUNCHER_EOF'
#!/bin/sh
# PVP Git Bridge Service Launcher

PVP_DIR="${PVP_DIR:-$HOME/.pvp}"
BRIDGE_DIR="$PVP_DIR/git-bridge"

case "$1" in
    start)
        if [ -f "$PVP_DIR/bridge.pid" ] && kill -0 "$(cat "$PVP_DIR/bridge.pid")" 2>/dev/null; then
            echo "Bridge is already running (PID: $(cat "$PVP_DIR/bridge.pid"))"
            exit 0
        fi
        echo "Starting PVP Git Bridge..."
        cd "$BRIDGE_DIR" || exit 1
        nohup node --experimental-specifier-resolution=node bridge-service.js > "$PVP_DIR/bridge.log" 2>&1 &
        echo $! > "$PVP_DIR/bridge.pid"
        echo "Bridge started (PID: $!)"
        ;;
    stop)
        if [ -f "$PVP_DIR/bridge.pid" ]; then
            pid=$(cat "$PVP_DIR/bridge.pid")
            if kill -0 "$pid" 2>/dev/null; then
                kill "$pid"
                rm -f "$PVP_DIR/bridge.pid"
                echo "Bridge stopped"
            else
                rm -f "$PVP_DIR/bridge.pid"
                echo "Bridge was not running"
            fi
        else
            echo "Bridge is not running"
        fi
        ;;
    restart)
        $0 stop
        sleep 1
        $0 start
        ;;
    status)
        if [ -f "$PVP_DIR/bridge.pid" ] && kill -0 "$(cat "$PVP_DIR/bridge.pid")" 2>/dev/null; then
            echo "Bridge is running (PID: $(cat "$PVP_DIR/bridge.pid"))"
            # Query status endpoint
            if command -v curl >/dev/null 2>&1; then
                curl -s http://localhost:9847/status 2>/dev/null || true
            fi
        else
            echo "Bridge is not running"
        fi
        ;;
    logs)
        if [ -f "$PVP_DIR/bridge.log" ]; then
            tail -f "$PVP_DIR/bridge.log"
        else
            echo "No log file found"
        fi
        ;;
    *)
        echo "Usage: $0 {start|stop|restart|status|logs}"
        exit 1
        ;;
esac
LAUNCHER_EOF
    chmod +x "$launcher"

    echo "  ${GREEN}✓${NC} Installed bridge service to $bridge_dest"
    echo "  ${GREEN}✓${NC} Created launcher at $launcher"

    # Add to PATH hint
    case ":$PATH:" in
        *":$PVP_BIN_DIR:"*) ;;
        *)
            echo ""
            echo "${YELLOW}Add this to your shell profile:${NC}"
            echo "  export PATH=\"\$PATH:$PVP_BIN_DIR\""
            ;;
    esac

    echo ""
}

# Create systemd user service (optional)
create_systemd_service() {
    if [ -d "$HOME/.config/systemd/user" ] || command -v systemctl >/dev/null 2>&1; then
        echo "${YELLOW}Creating systemd user service (optional)...${NC}"

        mkdir -p "$HOME/.config/systemd/user"

        cat > "$HOME/.config/systemd/user/pvp-git-bridge.service" << SERVICE_EOF
[Unit]
Description=PVP Git Bridge Service
After=network.target

[Service]
Type=simple
ExecStart=$PVP_BIN_DIR/pvp-git-bridge start
ExecStop=$PVP_BIN_DIR/pvp-git-bridge stop
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
SERVICE_EOF

        echo "  ${GREEN}✓${NC} Created systemd service"
        echo ""
        echo "${BLUE}To enable auto-start:${NC}"
        echo "  systemctl --user enable pvp-git-bridge"
        echo "  systemctl --user start pvp-git-bridge"
        echo ""
    fi
}

# Interactive installation
interactive_install() {
    echo "${YELLOW}Interactive Installation${NC}"
    echo ""

    # Ask about hooks
    if ! "$BRIDGE_ONLY"; then
        echo "Where would you like to install git hooks?"
        echo "  1) Current repository ($(pwd))"
        echo "  2) Specific repository path"
        echo "  3) Global (all new repositories)"
        echo "  4) Skip hook installation"
        echo ""
        printf "Choice [1-4]: "
        read choice

        case "$choice" in
            1)
                install_to_repo "$(pwd)"
                ;;
            2)
                printf "Enter repository path: "
                read repo_path
                install_to_repo "$repo_path"
                ;;
            3)
                install_global
                ;;
            4)
                echo "Skipping hook installation."
                ;;
            *)
                echo "${RED}Invalid choice${NC}"
                exit 1
                ;;
        esac
    fi

    # Ask about bridge
    if ! "$HOOKS_ONLY" && command -v node >/dev/null 2>&1; then
        echo ""
        printf "Install PVP Git Bridge Service? [Y/n]: "
        read answer

        case "$answer" in
            [Nn]*)
                echo "Skipping bridge installation."
                ;;
            *)
                install_bridge
                create_systemd_service
                ;;
        esac
    fi
}

# Main installation flow
main() {
    check_prerequisites
    setup_directories

    if "$BRIDGE_ONLY"; then
        install_bridge
        create_systemd_service
    elif "$HOOKS_ONLY"; then
        if [ -n "$GIT_REPO_PATH" ]; then
            install_to_repo "$GIT_REPO_PATH"
        elif [ "$INSTALL_MODE" = "global" ]; then
            install_global
        else
            interactive_install
        fi
    elif [ -n "$GIT_REPO_PATH" ]; then
        install_to_repo "$GIT_REPO_PATH"
        install_bridge
        create_systemd_service
    elif [ "$INSTALL_MODE" = "global" ]; then
        install_global
        install_bridge
        create_systemd_service
    else
        interactive_install
    fi

    echo "${GREEN}╔════════════════════════════════════════════╗${NC}"
    echo "${GREEN}║       Installation Complete!               ║${NC}"
    echo "${GREEN}╚════════════════════════════════════════════╝${NC}"
    echo ""
    echo "Quick start:"
    echo "  1. Start the bridge: pvp-git-bridge start"
    echo "  2. Make commits as usual - PVP metadata will be added"
    echo "  3. Check commit: git log --show-notes=refs/notes/pvp"
    echo ""
    echo "Configuration:"
    echo "  Edit .pvp-git.config.json in your repository"
    echo ""
    echo "For help: $0 --help"
    echo ""
}

main "$@"
