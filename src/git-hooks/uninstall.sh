#!/bin/sh
# PVP Git Hooks Uninstallation Script
# Removes git hooks and the PVP-Git bridge service

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
PVP_DIR="$HOME/.pvp"
PVP_BIN_DIR="$HOME/.local/bin"

print_usage() {
    echo "Usage: $0 [options]"
    echo ""
    echo "Options:"
    echo "  -r, --repo PATH     Remove hooks from specific repository"
    echo "  -g, --global        Remove global git template hooks"
    echo "  -a, --all           Remove everything (hooks, bridge, config)"
    echo "  -b, --bridge-only   Only remove bridge service"
    echo "  --help              Show this help message"
}

REMOVE_REPO=""
REMOVE_GLOBAL=false
REMOVE_ALL=false
BRIDGE_ONLY=false

while [ $# -gt 0 ]; do
    case "$1" in
        -r|--repo)
            REMOVE_REPO="$2"
            shift 2
            ;;
        -g|--global)
            REMOVE_GLOBAL=true
            shift
            ;;
        -a|--all)
            REMOVE_ALL=true
            shift
            ;;
        -b|--bridge-only)
            BRIDGE_ONLY=true
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

echo ""
echo "${BLUE}╔════════════════════════════════════════════╗${NC}"
echo "${BLUE}║    PVP Git Hooks Uninstallation Script     ║${NC}"
echo "${BLUE}╚════════════════════════════════════════════╝${NC}"
echo ""

# Stop bridge if running
stop_bridge() {
    if [ -f "$PVP_DIR/bridge.pid" ]; then
        pid=$(cat "$PVP_DIR/bridge.pid")
        if kill -0 "$pid" 2>/dev/null; then
            echo "${YELLOW}Stopping bridge service...${NC}"
            kill "$pid" 2>/dev/null || true
            rm -f "$PVP_DIR/bridge.pid"
            echo "  ${GREEN}✓${NC} Bridge stopped"
        fi
    fi

    # Also stop via systemd if applicable
    if command -v systemctl >/dev/null 2>&1; then
        systemctl --user stop pvp-git-bridge 2>/dev/null || true
        systemctl --user disable pvp-git-bridge 2>/dev/null || true
    fi
}

# Remove hooks from repository
remove_from_repo() {
    repo_path="$1"

    if [ -d "$repo_path/.git" ]; then
        git_dir="$repo_path/.git"
    elif [ -d "$repo_path" ] && git -C "$repo_path" rev-parse --git-dir >/dev/null 2>&1; then
        git_dir=$(git -C "$repo_path" rev-parse --git-dir)
        case "$git_dir" in
            /*) ;;
            *) git_dir="$repo_path/$git_dir" ;;
        esac
    else
        echo "${RED}Error: $repo_path is not a git repository${NC}"
        return 1
    fi

    hooks_dir="$git_dir/hooks"

    echo "${YELLOW}Removing hooks from $hooks_dir${NC}"

    for hook in prepare-commit-msg post-commit pre-push; do
        hook_file="$hooks_dir/$hook"
        if [ -f "$hook_file" ]; then
            # Check if it's a PVP hook
            if grep -q "PVP Git Hook" "$hook_file" 2>/dev/null; then
                rm -f "$hook_file"
                echo "  ${GREEN}✓${NC} Removed $hook"
            else
                echo "  ${YELLOW}⚠${NC} $hook is not a PVP hook, skipping"
            fi
        fi
    done

    echo ""
}

# Remove global template hooks
remove_global() {
    template_dir="$HOME/.git-template"
    hooks_template="$template_dir/hooks"

    echo "${YELLOW}Removing global template hooks...${NC}"

    if [ -d "$hooks_template" ]; then
        for hook in prepare-commit-msg post-commit pre-push; do
            hook_file="$hooks_template/$hook"
            if [ -f "$hook_file" ]; then
                if grep -q "PVP Git Hook" "$hook_file" 2>/dev/null; then
                    rm -f "$hook_file"
                    echo "  ${GREEN}✓${NC} Removed $hook"
                else
                    echo "  ${YELLOW}⚠${NC} $hook is not a PVP hook, skipping"
                fi
            fi
        done
    else
        echo "  ${YELLOW}⚠${NC} No template hooks found"
    fi

    # Check if template dir is empty
    if [ -d "$hooks_template" ] && [ -z "$(ls -A "$hooks_template")" ]; then
        rmdir "$hooks_template" 2>/dev/null || true
    fi

    echo ""
}

# Remove bridge service
remove_bridge() {
    echo "${YELLOW}Removing bridge service...${NC}"

    stop_bridge

    # Remove launcher
    if [ -f "$PVP_BIN_DIR/pvp-git-bridge" ]; then
        rm -f "$PVP_BIN_DIR/pvp-git-bridge"
        echo "  ${GREEN}✓${NC} Removed launcher"
    fi

    # Remove bridge directory
    if [ -d "$PVP_DIR/git-bridge" ]; then
        rm -rf "$PVP_DIR/git-bridge"
        echo "  ${GREEN}✓${NC} Removed bridge directory"
    fi

    # Remove systemd service
    if [ -f "$HOME/.config/systemd/user/pvp-git-bridge.service" ]; then
        rm -f "$HOME/.config/systemd/user/pvp-git-bridge.service"
        systemctl --user daemon-reload 2>/dev/null || true
        echo "  ${GREEN}✓${NC} Removed systemd service"
    fi

    # Remove state file
    if [ -f "$PVP_DIR/git-bridge-state.json" ]; then
        rm -f "$PVP_DIR/git-bridge-state.json"
        echo "  ${GREEN}✓${NC} Removed state file"
    fi

    # Remove log file
    if [ -f "$PVP_DIR/bridge.log" ]; then
        rm -f "$PVP_DIR/bridge.log"
        echo "  ${GREEN}✓${NC} Removed log file"
    fi

    echo ""
}

# Remove all PVP-git related files
remove_all() {
    echo "${YELLOW}Removing all PVP-git files...${NC}"

    remove_bridge

    # Remove global hooks
    remove_global

    # Clean up PVP directory if empty
    if [ -d "$PVP_DIR" ] && [ -z "$(ls -A "$PVP_DIR" 2>/dev/null)" ]; then
        rmdir "$PVP_DIR"
        echo "  ${GREEN}✓${NC} Removed empty $PVP_DIR"
    fi

    echo ""
    echo "${GREEN}All PVP-git files removed.${NC}"
    echo ""
    echo "${YELLOW}Note:${NC} Repository-specific hooks must be removed manually:"
    echo "  $0 -r /path/to/repo"
    echo ""
}

# Main
main() {
    if "$BRIDGE_ONLY"; then
        remove_bridge
    elif "$REMOVE_ALL"; then
        remove_all
    elif "$REMOVE_GLOBAL"; then
        remove_global
        remove_bridge
    elif [ -n "$REMOVE_REPO" ]; then
        remove_from_repo "$REMOVE_REPO"
    else
        # Interactive
        echo "What would you like to remove?"
        echo "  1) Hooks from current repository"
        echo "  2) Hooks from specific repository"
        echo "  3) Global template hooks"
        echo "  4) Bridge service only"
        echo "  5) Everything"
        echo ""
        printf "Choice [1-5]: "
        read choice

        case "$choice" in
            1) remove_from_repo "$(pwd)" ;;
            2)
                printf "Enter repository path: "
                read repo_path
                remove_from_repo "$repo_path"
                ;;
            3) remove_global ;;
            4) remove_bridge ;;
            5) remove_all ;;
            *) echo "${RED}Invalid choice${NC}"; exit 1 ;;
        esac
    fi

    echo "${GREEN}Uninstallation complete.${NC}"
    echo ""
}

main "$@"
