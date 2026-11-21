#!/bin/bash
set -e
source /home/iecme/omnifleet_fleet/env.bash
exec /usr/bin/python3 /home/iecme/workspace/omnifleet_t2_ws/foxglove/nav2_permanent_panel/navigation_restart.py "$@"
