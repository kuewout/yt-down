#!/bin/bash

# yt-dlp URL Downloader Script with error handling
set -eo pipefail  # Exit on error, undefined vars, pipe failures

# Color codes for better UX
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly NC='\033[0m' # No Color

# Helper functions
print_error() {
    echo -e "${RED}Error: $1${NC}" >&2
}

print_success() {
    echo -e "${GREEN}$1${NC}"
}

print_warning() {
    echo -e "${YELLOW}$1${NC}"
}

print_header() {
    echo ""
    echo "=== $1 ==="
    echo ""
}

# Check if yt-dlp is installed
if ! command -v yt-dlp &> /dev/null; then
    print_error "yt-dlp is not installed. Please install it first:"
    echo "  brew install yt-dlp  # macOS"
    echo "  pip install yt-dlp   # Python"
    exit 1
fi

print_header "YouTube Downloader"

# 1. Prompt for YouTube URL (mandatory)
while true; do
    read -rp "Paste YouTube URL (video or playlist): " youtube_url
    
    if [[ -z "$youtube_url" ]]; then
        print_error "URL cannot be empty. Please try again."
        echo ""
        continue
    fi
    
    # Extract video ID (11 characters, alphanumeric + - and _)
    video_id=""
    if [[ "$youtube_url" =~ (v=|youtu\.be/)([A-Za-z0-9_-]{11}) ]]; then
        video_id="${BASH_REMATCH[2]}"
    fi
    
    # Extract playlist ID - FIX: Escape ? and & in regex
    playlist_id=""
    if [[ "$youtube_url" =~ (\?|&)list=([A-Za-z0-9_-]+) ]]; then
        playlist_id="${BASH_REMATCH[2]}"
    fi
    
    # Validate that we found at least one ID
    if [[ -z "$video_id" ]] && [[ -z "$playlist_id" ]]; then
        print_error "Could not extract video or playlist ID from URL. Please check the URL and try again."
        echo ""
        continue
    fi
    
    break
done

print_header "Extracted Information"
[[ -n "$video_id" ]] && echo "Video ID: $video_id"
[[ -n "$playlist_id" ]] && echo "Playlist ID: $playlist_id"

# 2. Ask user what to download
download_mode=""
download_url=""

if [[ -n "$video_id" ]] && [[ -n "$playlist_id" ]]; then
    echo "This URL contains both a video and a playlist."
    echo "  1. Download single video only"
    echo "  2. Download entire playlist"
    echo ""
    
    while true; do
        read -rp "What would you like to download? (1 or 2): " mode_choice
        
        case "$mode_choice" in
            1)
                download_mode="video"
                download_url="https://www.youtube.com/watch?v=$video_id"
                break
                ;;
            2)
                download_mode="playlist"
                download_url="https://www.youtube.com/playlist?list=$playlist_id"
                break
                ;;
            *)
                print_error "Invalid choice. Please enter 1 or 2."
                echo ""
                ;;
        esac
    done
elif [[ -n "$playlist_id" ]]; then
    download_mode="playlist"
    download_url="https://www.youtube.com/playlist?list=$playlist_id"
    echo "Detected: Playlist URL"
elif [[ -n "$video_id" ]]; then
    download_mode="video"
    download_url="https://www.youtube.com/watch?v=$video_id"
    echo "Detected: Single video URL"
fi

echo "Download mode: $download_mode"
echo ""

# 3. Prompt for output folder (mandatory)
while true; do
    read -rp "Enter folder name to store videos: " folder_name
    
    if [[ -z "$folder_name" ]]; then
        print_error "Folder name cannot be empty. Please try again."
        echo ""
    elif [[ "$folder_name" =~ [/\\] ]]; then
        print_error "Folder name cannot contain / or \\ characters. Please try again."
        echo ""
    else
        break
    fi
done

# Create folder if it doesn't exist
if ! mkdir -p "$folder_name"; then
    print_error "Failed to create directory: $folder_name"
    exit 1
fi

output_template="${folder_name}/%(upload_date)s %(title)s.%(ext)s"
print_success "Videos will be saved to: $folder_name/"
echo ""

# 4. Detect available browsers
echo "Detecting available browsers on your system..."
available_browsers=()

# Check for common browsers on macOS
if [[ -d "/Applications/Google Chrome.app" ]]; then
    available_browsers+=("chrome")
fi

if [[ -d "/Applications/Firefox.app" ]]; then
    available_browsers+=("firefox")
fi

if [[ -d "/Applications/Safari.app" ]]; then
    available_browsers+=("safari")
fi

if [[ -d "/Applications/Microsoft Edge.app" ]]; then
    available_browsers+=("edge")
fi

if [[ -d "/Applications/Brave Browser.app" ]]; then
    available_browsers+=("brave")
fi

if [[ -d "/Applications/Opera.app" ]]; then
    available_browsers+=("opera")
fi

# Display available browsers
browser="none"
if [[ ${#available_browsers[@]} -eq 0 ]]; then
    print_warning "No supported browsers found. Will proceed without cookies."
else
    echo "Available browsers:"
    for i in "${!available_browsers[@]}"; do
        echo "  $((i+1)). ${available_browsers[$i]}"
    done
    echo "  0. Skip cookies (no browser)"
    echo ""
    
    # Prompt for browser selection
    read -rp "Select browser for cookies (default: 1): " browser_choice
    
    if [[ -z "$browser_choice" ]] || [[ "$browser_choice" == "1" ]]; then
        if [[ ${#available_browsers[@]} -gt 0 ]]; then
            browser="${available_browsers[0]}"
        else
            browser="none"
        fi
    elif [[ "$browser_choice" == "0" ]]; then
        browser="none"
    elif [[ "$browser_choice" =~ ^[0-9]+$ ]] && (( browser_choice >= 1 && browser_choice <= ${#available_browsers[@]} )); then
        browser="${available_browsers[$((browser_choice-1))]}"
    else
        browser="$browser_choice"
    fi
fi

echo "Selected browser: $browser"
echo ""

# 5. Prompt for video resolution
echo "Video resolution options:"
echo "  1. Best available"
echo "  2. 1440p [default]"
echo "  3. 1080p (Full HD)"
echo "  4. 720p (HD)"
echo "  5. 480p (SD)"
echo "  6. 360p"
echo ""

read -rp "Select resolution (default: 2): " resolution_choice

max_height=""
resolution_display=""

case "$resolution_choice" in
    1) 
        max_height=""
        resolution_display="Best available"
        ;;
    2|"") 
        max_height=1440
        resolution_display="1440p"
        ;;
    3) 
        max_height=1080
        resolution_display="1080p"
        ;;
    4) 
        max_height=720
        resolution_display="720p"
        ;;
    5) 
        max_height=480
        resolution_display="480p"
        ;;
    6) 
        max_height=360
        resolution_display="360p"
        ;;
    *)
        print_warning "Invalid choice, using default 1440p"
        max_height=1440
        resolution_display="1440p"
        ;;
esac

echo "Selected resolution: $resolution_display"

# 6. Prompt for playlist start index (only for playlists)
playlist_start=1
if [[ "$download_mode" == "playlist" ]]; then
    echo ""
    read -rp "Start downloading from video number (default: 1): " start_choice
    
    if [[ -n "$start_choice" ]]; then
        if [[ "$start_choice" =~ ^[0-9]+$ ]] && (( start_choice > 0 )); then
            playlist_start="$start_choice"
            echo "Will start from video #$playlist_start"
        else
            print_warning "Invalid number, using default (1)"
            playlist_start=1
        fi
    fi
fi

print_header "Starting Download"
echo "Mode: $download_mode"
echo "URL: $download_url"
echo "Output Folder: $folder_name/"
echo "Browser: $browser"
echo "Resolution: $resolution_display"
echo ""

# Build yt-dlp command as array for safer execution
yt_dlp_cmd=(yt-dlp)

# Add cookies if browser is selected
if [[ "$browser" != "none" ]]; then
    yt_dlp_cmd+=(--cookies-from-browser "$browser")
fi

# Add format selection
if [[ -z "$max_height" ]]; then
    yt_dlp_cmd+=(-f "bestvideo*[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best[ext=mp4]/best")
else
    yt_dlp_cmd+=(-f "bestvideo*[ext=mp4][height<=$max_height]+bestaudio[ext=m4a]/bestvideo*[height<=$max_height]+bestaudio/best[ext=mp4][height<=$max_height]/best[height<=$max_height]")
fi
yt_dlp_cmd+=(--merge-output-format mp4)

# Add playlist start index if downloading playlist
if [[ "$download_mode" == "playlist" ]] && (( playlist_start > 1 )); then
    yt_dlp_cmd+=(--playlist-start "$playlist_start")
fi

# Add output template and URL
yt_dlp_cmd+=(-o "$output_template" "$download_url")

# Execute the command
if "${yt_dlp_cmd[@]}"; then
    print_header "Download Complete"
    print_success "All files saved to: $folder_name/"
else
    print_header "Download Failed"
    print_error "yt-dlp encountered an error. Please check the URL and try again."
    exit 1
fi
