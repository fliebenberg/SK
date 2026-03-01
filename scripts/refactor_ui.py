import os
import re

files_to_patch = [
    r"c:\Fred\Coding\SK\client\src\app\admin\games\new\page.tsx",
    r"c:\Fred\Coding\SK\client\src\app\admin\organizations\[id]\events\[eventId]\games\[gameId]\edit\page.tsx",
    r"c:\Fred\Coding\SK\client\src\app\admin\organizations\[id]\events\[eventId]\games\new\page.tsx",
    r"c:\Fred\Coding\SK\client\src\app\admin\organizations\[id]\events\[eventId]\page.tsx",
    r"c:\Fred\Coding\SK\client\src\app\admin\organizations\[id]\events\create\page.tsx",
    r"c:\Fred\Coding\SK\client\src\app\admin\organizations\[id]\page.tsx",
    r"c:\Fred\Coding\SK\client\src\app\games\[id]\page.tsx",
    r"c:\Fred\Coding\SK\client\src\components\admin\events\EventList.tsx",
    r"c:\Fred\Coding\SK\client\src\components\admin\games\GameDialog.tsx",
    r"c:\Fred\Coding\SK\client\src\components\admin\games\MatchForm.tsx",
    r"c:\Fred\Coding\SK\client\src\components\ui\MatchCard.tsx",
    r"c:\Fred\Coding\SK\client\src\lib\store.test.ts"
]

for file_path in files_to_patch:
    if not os.path.exists(file_path):
        print(f"File not found: {file_path}")
        continue
        
    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()

    # Replacements
    content = content.replace("venueId", "siteId")
    content = content.replace("getVenues", "getSites")
    content = content.replace(".venues", ".sites")
    content = content.replace("{venues", "{sites")
    content = content.replace("const venues ", "const sites ")
    content = content.replace("venues.map", "sites.map")
    content = content.replace("getVenue", "getSite")
    content = content.replace("addVenue", "addSite")
    content = content.replace("deleteVenue", "deleteSite")
    content = content.replace("updateVenue", "updateSite")
    content = content.replace("venue name", "site name")
    content = content.replace("Venue Name", "Site Name")
    content = content.replace("No venue", "No site")
    content = content.replace("Venue:", "Site:")
    content = content.replace("Select Venue", "Select Site")
    content = content.replace("Select venue", "Select site")
    content = content.replace('venue:', 'site:')
    content = content.replace('Venue', 'Site')
    content = content.replace('venue', 'site')
    content = content.replace('Venues', 'Sites')
    content = content.replace('venues', 'sites')
    # Because of casing some might have been replaced wrongly, let's fix imports if any
    content = content.replace('import { Site } from', 'import { Site, Facility } from')
    
    with open(file_path, "w", encoding="utf-8") as f:
        f.write(content)
        
print("Replacement script finished.")
