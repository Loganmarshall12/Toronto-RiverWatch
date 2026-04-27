
let map;
let currentMonth = 1;
const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                    'July', 'August', 'September', 'October', 'November', 'December'];

let currentScenario = 'none';
const scenarioLabels = {
    'none': 'None',
    '100year': '100-Year Storm',
    'custom': 'Custom Scenario'
};

// Store our polygons and markers
let neighborhoodPolygons = [];
let stationMarkers = [];
let floodplainPolygons = [];
let scenarioActive = false;
let currentPolicy = 1.0;
let currentLandUse = 1.0;
let currentClimate = 1.0;

// When the page loads, do these things
window.onload = function() {
    // 1. Create the Google Map
    map = new google.maps.Map(document.getElementById('map'), {
        center: { lat: 43.72, lng: -79.38 },  // Toronto coordinates
        zoom: 11  // Zoom level (11 = can see whole city)
    });
        //adding restrictions for the map 
    const TORONTO_BOUNDS = {
        north: 43.900,
        south: 43.500,
        east: -79.000,
        west: -79.750,
    };

    map.setOptions({
        restriction: {
            latLngBounds: TORONTO_BOUNDS,
            strictBounds: false,
        }
    });
  
    // 2. Set up the month slider
    const monthSlider = document.getElementById('monthSlider');
    monthSlider.addEventListener('input', function() {
        currentMonth = parseInt(this.value);
        document.getElementById('month').textContent = monthNames[currentMonth - 1];
        loadRiskData(currentMonth);
    });
    
    // 3. Set up refresh button
    document.getElementById('refresh').addEventListener('click', function() {
        loadData();
    });
    
    // 4. Load data from JSON
    loadData();
    loadFloodplains();

    //5. Set up checkbox for floodplain toggle
    
    document.getElementById('toggleFloodplains').addEventListener('change', function () {
        const visible = this.checked;
        floodplainPolygons.forEach((item) => {
            if (item && item.polygon) {
                item.polygon.setMap(visible ? map : null);
            }
        });
        // Lower neighborhood opacity so floodplains show through
        neighborhoodPolygons.forEach((item) => {
            if (item && item.polygon) {
                item.polygon.setOptions({ fillOpacity: visible ? 0.2 : 0.5 });
            }
        });
    });

    // Scenario sliders
    const policySlider = document.getElementById('policySlider');
    const landUseSlider = document.getElementById('landUseSlider');
    const climateSlider = document.getElementById('climateSlider');
    const policyVal = document.getElementById('policyValue');
    const landUseVal = document.getElementById('landUseValue');
    const climateVal = document.getElementById('climateValue');

    policySlider.addEventListener('input', function () {
        currentPolicy = parseFloat(this.value);
        policyVal.innerText = currentPolicy.toFixed(2);
    });
    landUseSlider.addEventListener('input', function () {
        currentLandUse = parseFloat(this.value);
        landUseVal.innerText = currentLandUse.toFixed(2);
    });
    climateSlider.addEventListener('input', function () {
        currentClimate = parseFloat(this.value);
        climateVal.innerText = currentClimate.toFixed(2);
    });

    document.getElementById('applyScenario').addEventListener('click', function () {
        scenarioActive = true;
        currentScenario = 'custom';        
        showBanner('Custom Scenario');        
        loadScenarioRisk(currentMonth, currentPolicy, currentLandUse, currentClimate);
    });

    document.getElementById('resetScenario').addEventListener('click', function () {
        currentScenario = 'none';          
        hideBanner();  
        loadRiskData(currentMonth);   // reload real risk data
        // reset sliders to default 1.0
        policySlider.value = "1.0";
        landUseSlider.value = "1.0";
        climateSlider.value = "1.0";
        policyVal.innerText = "1.00";
        landUseVal.innerText = "1.00";
        climateVal.innerText = "1.00";
        currentPolicy = 1.0;
        currentLandUse = 1.0;
        currentClimate = 1.0;
    });
 // For 100 year storm scenario selection
      document.querySelectorAll('[data-scenario]').forEach(function (item) {
        item.addEventListener('click', function (e) {
            e.preventDefault();
            currentScenario = this.dataset.scenario;
            scenarioActive = currentScenario !== 'none';
            document.getElementById('scenarioButton').textContent = 'Scenario: ' + scenarioLabels[currentScenario];
            if (currentScenario === 'none') {
                hideBanner();
                loadRiskData(currentMonth);
            } else {
                showBanner(scenarioLabels[currentScenario]);
                load100YearRisk(currentMonth);
            }
        });
    });

};

// Function to load neighborhoods and stations from JSON
function loadData() {
    console.log("Loading data from C# API...");
    
    // Try to get data from the API (running on port 5050)
    fetch('data/MapData.json')
        .then(response => {
            // If response is bad, show error
            if (!response.ok) {
                throw new Error("C# API not responding");
            }
            return response.json();  // Convert to JSON
        })
        .then(data => {
            console.log("Got data from C#:", data);

            //Set floodplain toggle to false on data refresh
            document.getElementById('toggleFloodplains').checked = false;
            document.getElementById('toggleFloodplains').dispatchEvent(new Event('change'));
            
            // Draw neighborhoods on map
            drawNeighborhoods(data.neighborhoods || []);
            
            // Draw stations on map
            drawStations(data.stations || []);

   
            // Load risk data for current month
            loadRiskData(currentMonth);
        })
        .catch(error => {
            console.log("Error:", error);
            alert("Could not connect to C# API. Make sure:\n1. C# app is running\n2. Using correct port (5050)");
        });
}

// Function to load risk scores for a specific month
function loadRiskData(month) {
    console.log("Loading risk data for month", month);
    if (currentScenario === '100year') {
        load100YearRisk(month);
        return;
    }
    if (currentScenario === 'custom') {
        loadScenarioRisk(month, currentPolicy, currentLandUse, currentClimate);
        return;
    }

    fetch('data/Risk' + month + '.json')
        .then(response => response.json())
        .then(data => {
            if (data.risks && data.risks.length > 0) {
                // Update colors on map based on risk
                updateRiskColors(data.risks);
                // Adding station values to be updated monthly
                drawStations(data.stations);

                //Update summary stats from monthly stats dropdown
                let total = 0;
                let highCount = 0;
                let highest = data.risks[0];
                let lowest = data.risks[0];

                data.risks.forEach(n => {
                    total += n.risk;

                    if (n.risk >= 0.7) {
                        highCount++;
                    }

                    if (n.risk > highest.risk) {
                        highest = n;
                    }

                    if (n.risk < lowest.risk) {
                        lowest = n;
                    }
                });

                let avg = total / data.risks.length;
                let percent = ((highCount / data.risks.length) * 100).toFixed(1);

                document.getElementById("avg-risk").innerText = "Average Risk: " + avg.toFixed(2);
                document.getElementById("high-risk").innerText = "High-Risk Neighbourhoods: " + percent + "%";
                document.getElementById("highest-risk").innerText = "Highest Risk: " + highest.name;
                document.getElementById("lowest-risk").innerText = "Lowest Risk: " + lowest.name;
                document.getElementById("stats-button").innerText = "Show Monthly Statistics: " + monthNames[month - 1]
            }
        })
        .catch(error => {
            console.log("Error loading risk data:", error);
        });
}

// Draw neighborhoods as polygons on the map
function drawNeighborhoods(neighborhoods) {
    console.log("Drawing", neighborhoods.length, "neighborhoods");
    
    // Clear any old neighborhoods
    if (neighborhoodPolygons.length > 0) {
        neighborhoodPolygons.forEach(function(polygonItem) {
            // Check if it's a valid polygon
            if (polygonItem && polygonItem.polygon) {
                polygonItem.polygon.setMap(null);
            }
        });
    }
    
    // Reset the array
    neighborhoodPolygons = [];
    
    // For each neighborhood from JSON
    neighborhoods.forEach(function(area) {
        if (!area.boundary) return;  // Skip if no boundary
        
        // Convert WKT string to coordinates for GoogleMaps
        const coords = parseWKT(area.boundary);
        if (!coords) return;
        
        // Create a colored polygon on the map
        const polygon = new google.maps.Polygon({
            paths: coords,  
            strokeColor: '#666666', 
            strokeWeight: 1,         
            fillColor: '#CCCCCC',    
            fillOpacity: 0.5,       
            map: map                 
        });
        
        // When user clicks a neighborhood, show its info
        polygon.addListener('click', function() {
            document.getElementById('selectedName').textContent = area.name || 'Unknown';
            document.getElementById('selectedRisk').textContent = area.risk || '--';
            document.getElementById('selectedCategory').textContent = area.category || '--';
        });
        
        neighborhoodPolygons.push({
            polygon: polygon,
            data: area
        });
    });
}

// Draw stations as markers on the map
function drawStations(stations) {
    console.log("Drawing", stations.length, "stations");
    
    // Clear any old stations
    if (stationMarkers.length > 0) {
        stationMarkers.forEach(function(marker) {
            if (marker) {
                marker.setMap(null);
            }
        });
    }
    
    // Reset the array
    stationMarkers = [];
    
    // For each station from JSON
    stations.forEach(function(station) {
        // Create a marker on the map
        const marker = new google.maps.Marker({
            position: { lat: station.lat, lng: station.lng },  
            map: map,                                           
            title: station.name + ' | ' + station.type + ' | ' + station.value + ' ' + station.unit,                                
            // Blue dot for flow stations, purple for precipitation
            icon: station.type === 'Flow' ? 
                'http://maps.google.com/mapfiles/ms/icons/blue-dot.png' :
                'http://maps.google.com/mapfiles/ms/icons/purple-dot.png'
        });
        
        stationMarkers.push(marker);
    });
}

//New function to bring floodplain polygons to web map
function drawFloodplains(floodplains) {
    console.log("Drawing", floodplains.length, "floodplains")
    // Clear any old floodplains
    if (floodplainPolygons.length > 0) {
        floodplainPolygons.forEach(function (polygonItem) {
            // Check if it's a valid polygon
            if (polygonItem && polygonItem.polygon) {
                polygonItem.polygon.setMap(null);
            }
        });
    }

    // Reset the array
    floodplainPolygons = [];

    floodplains.forEach(function (area) {
        if (!area.boundary) return;  // Skip if no boundary

        // Convert WKT string to coordinates for GoogleMaps
        const coords = parseWKTFloodplain(area.boundary);
        if (!coords) return;
        

        // Create a colored polygon on the map
        const paths = Array.isArray(coords[0]) ? coords : [coords];
        paths.forEach(function (path) {
            const polygon = new google.maps.Polygon({
                paths: path,
                strokeColor: '#666666',
                strokeWeight: 1,
                fillColor: '#Add8e6',
                fillOpacity: 0.50,
                title: area.watershed,
                map: null
            });
            floodplainPolygons.push({ polygon: polygon, data: area });
        });


    });
}

// Update polygon colors based on risk scores
// For sprint 2, all neighborhoods will be the same color based on risk category of month.
// They will be updated to show individual neighborhood risk using risk calculation in sprint 3.
function updateRiskColors(risks) {
    console.log("Updating colors for", risks.length, "areas");
    
    if (neighborhoodPolygons.length === 0) return;
    
    // For each risk value from JSON
    risks.forEach(function(risk) {
        // Find the matching neighborhood polygon
        let found = false;
        
        for (let i = 0; i < neighborhoodPolygons.length; i++) {
            const polygonItem = neighborhoodPolygons[i];
            
            // Check if this is the right neighborhood
            if (polygonItem.data.id == risk.id) {
                found = true;
                
                if (risk.risk !== undefined) {
                    let color = '#CCCCCC';  
                    let category = 'Unknown';
                    
                    // Color code based on risk score:
                    if (risk.risk >= 0.7) {
                        color = '#FF0000';  // Red = High risk
                        category = 'High';
                    } else if (risk.risk >= 0.4) {
                        color = '#FFFF00';  // Yellow = Medium risk
                        category = 'Medium';
                    } else {
                        color = '#00FF00';  // Green = Low risk
                        category = 'Low';
                    }
                    
                    // Update the polygon color
                    polygonItem.polygon.setOptions({
                        fillColor: color,
                        strokeColor: color
                    });
                    
                    // Save the risk value for when user clicks
                    polygonItem.data.risk = risk.risk;
                    polygonItem.data.category = category;
                }
                
                break; // Found it, stop looking
            }
        }
    });
}

// Helper function to convert WKT to coordinates
function parseWKT(wkt) {

    if (!wkt || typeof wkt !== 'string') return null; 
    try {
        // Extract the coordinate string
        const match = wkt.match(/\(\(([^)]+)\)\)/);
        if (!match) return null;
        
        // Split into individual coordinates and convert to numbers
        const coordStrings = match[1].split(',');
        const coords = [];
        
        for (let i = 0; i < coordStrings.length; i++) {
            const parts = coordStrings[i].trim().split(' ');
            if (parts.length < 2) continue;
            
            const lng = parseFloat(parts[0]); 
            const lat = parseFloat(parts[1]);  
            
            // Check if we got valid numbrs
            if (!isNaN(lat) && !isNaN(lng)) {
                coords.push({ lat: lat, lng: lng });
            }
        }
        
        return coords;
    } catch(error) {
        console.log("Could not parse boundary:", error);
        return null;
    }
}

//Adding WKT parsing to display the floodplains
//Refer to the stackoverflow article as a refernce if needed to edit
//https://stackoverflow.com/questions/16482303/convert-well-known-text-wkt-from-mysql-to-google-maps-polygons-with-php

function parseWKTFloodplain(wkt) {
    if (!wkt || typeof wkt !== 'string') return null;

    //Handles mutipolygons
    if (wkt.includes('MULTIPOLYGON')) {
        var i, j, lng, lat, coordpairs, ringCoords,
            arr = [],
            rings = wkt.match(/\([^\(\)]+\)/g);
        if (rings !== null) {
            for (i = 0; i < rings.length; i++) {
                coordpairs = rings[i].match(/-?\d+\.?\d*/g);
                if (coordpairs !== null) {
                    for (j = 0, ringCoords = []; j < coordpairs.length; j += 2) {
                        lng = Number(coordpairs[j]);
                        lat = Number(coordpairs[j + 1]);
                        ringCoords.push({ lat: lat, lng: lng });
                    }
                    arr.push(ringCoords);
                }
            }
        }
        return arr.length > 0 ? arr : null;
    }

    //Handle polygons with holes similar to old WKT parse function for neighbourhoods
    //g just mean global to find all matches, was having issues without it
    try {
        const match = wkt.match(/\([^\(\)]+\)/g);
        if (!match) return null;

        const coordStrings = match[0].replace(/[()]/g, '').split(',');
        const coords = [];

        for (let i = 0; i < coordStrings.length; i++) {
            const parts = coordStrings[i].trim().split(' ');
            if (parts.length < 2) continue;

            const lng = parseFloat(parts[0]);
            const lat = parseFloat(parts[1]);

            if (!isNaN(lat) && !isNaN(lng)) {
                coords.push({ lat: lat, lng: lng });
            }
        }

        return coords;
    } catch (error) {
        console.log("Could not parse boundary:", error);
        return null;
    }
}

//Seperate function to load in floodplains initally but not on refresh. Because it was causing lag.
function loadFloodplains() {
    fetch('data/Floodplains.json')
        .then(response => response.json())
        .then(data => {
            drawFloodplains(data.floodplains || []);
        })
        .catch(error => console.log("Error loading floodplains:", error));
}

//Function for 100 year storm scenario and its banner
function load100YearRisk(month) {
    console.log("Loading 100-year storm scenario for month", month);
    fetch('data/Risk100Year' + month + '.json')
        .then(response => response.json())
        .then(data => {
            if (data.risks && data.risks.length > 0) {
                updateRiskColors(data.risks);
                drawStations(data.stations);
                updateScenarioStats(data.risks, month);
            }
        })
        .catch(error => console.error("Error loading 100-year scenario:", error));
}

function showBanner(label) {
    document.getElementById('scenario-banner-text').textContent = label;
    document.getElementById('scenario-banner').classList.remove('d-none');
}

function hideBanner() {
    document.getElementById('scenario-banner').classList.add('d-none');
}

function loadScenarioRisk(month, policy, landUse, climate){
    fetch('data/Risk' + month + '.json')
        .then(response => response.json())
        .then(data => {
            const adjustedRisks = data.risks.map(r => {
                let adjusted = r.risk * policy * landUse * climate;
                if (adjusted > 1)
                    adjusted = 1.0;
                if (adjusted < 0.0)
                    adjusted = 0.0;
                return{ 
                    id: r.id, 
                    name: r.name, 
                    risk: adjusted
                }
            });
            updateRiskColors(adjustedRisks);
            drawStations(data.stations);
            updateScenarioStats(adjustedRisks, month);
        })
        .catch(error => console.error("Error loading scenario risk", error))
}




function updateScenarioStats(risks, month) {
    let total = 0, highCount = 0, highest = risks[0], lowest = risks[0];
    risks.forEach(n => {
        total += n.risk;
        if (n.risk >= 0.7) highCount++;
        if (n.risk > highest.risk) highest = n;
        if (n.risk < lowest.risk) lowest = n;
    });
    let avg = total / risks.length;
    let percent = ((highCount / risks.length) * 100).toFixed(1);
    document.getElementById("avg-risk").innerText = "Average Risk: " + avg.toFixed(2);
    document.getElementById("high-risk").innerText = "High-Risk Neighbourhoods: " + percent + "%";
    document.getElementById("highest-risk").innerText = "Highest Risk: " + highest.name;
    document.getElementById("lowest-risk").innerText = "Lowest Risk: " + lowest.name;
    document.getElementById("stats-button").innerText = "Scenario: " + monthNames[month - 1];
}
