#!/bin/bash

# Setup script to initialize configuration files from samples
# Run this script once when setting up the project

echo "=== Agile Process Planner - Configuration Setup ==="
echo ""

# Function to copy sample file if target doesn't exist
copy_if_not_exists() {
    local sample_file=$1
    local target_file=$2
    
    if [ -f "$target_file" ]; then
        echo "✓ $target_file already exists (skipping)"
    else
        if [ -f "$sample_file" ]; then
            cp "$sample_file" "$target_file"
            echo "✓ Created $target_file from sample"
        else
            echo "✗ Sample file $sample_file not found"
            return 1
        fi
    fi
}

# Create config files
echo "Setting up configuration files..."
copy_if_not_exists "config/users.json.sample" "config/users.json"
copy_if_not_exists "config/roles.json.sample" "config/roles.json"
copy_if_not_exists "config/capacity.json.sample" "config/capacity.json"
copy_if_not_exists "config/projects.json.sample" "config/projects.json"
copy_if_not_exists "users.credentials.json.sample" "users.credentials.json"

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Next steps:"
echo "1. Edit config/users.json with your user data"
echo "2. Edit config/roles.json with your role definitions"
echo "3. Edit config/capacity.json with user capacity data"
echo "4. Edit config/projects.json with your Azure DevOps projects"
echo "5. Edit users.credentials.json with user credentials (keep secure!)"
echo ""
echo "Run 'npm test' to verify your setup"
