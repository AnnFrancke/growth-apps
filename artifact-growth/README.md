#Artifact Growth

Displays the artifact growth over time for the selected artifact type and workspaces.  

If no workspaces are selected, the artifact growth for the default workspace for the current user will be used.  

The artifact count includes current artifact counts.  

The growth numbers are cumulative over time and grouped by month.  If the end date falls before the end of the month, the number of artifacts at the end of the month will equal the number of artifacts on the end date, not the end of the month.

This app uses both the WSAPI and LBAPI apis to query for data.   

![ScreenShot](/images/artifact-growth.png)