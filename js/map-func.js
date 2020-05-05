// Author: Theodore Kruczek
// Last Update: 5/5/2020
// Version 1.0.0

var HEADING_LINE_DISTANCE = 50000;
var DEBUG_MODE = false;

var isFollowGps = false;
var forceGPS = false;
var map;
var heatmapRadius = 300;
var heatmapIntensity = 10;
var heatMapData = [];
var antMapData = [];
var headingLineData = [];
var saveData = [];
var lastLat;
var lastLng;
var lastMarker;
var touchPos;
var isMoving = false;

(function redirectHttpToHttps() {
  if (DEBUG_MODE) console.log(`${Date.now()}: redirectHttpToHttps()`);
    if (window.location.protocol === 'http:' && window.location.hostname === 'keeptrack.space') {
      var httpURL= window.location.hostname + window.location.pathname + window.location.search;
      var httpsURL= "https://" + httpURL;
      window.location = httpsURL;
    }
})();
(function listenerInit (){
  if (DEBUG_MODE) console.log(`${Date.now()}: listenerInit()`);
  document.getElementById('addRFrmb').addEventListener("click", function(){
    var instance = M.Modal.getInstance(document.getElementById('modal-rf'));
    document.getElementById('form-rf-lat').value = lastLat;
    document.getElementById('form-rf-lng').value = lastLng;
    M.updateTextFields();
    instance.open();
  });

  document.getElementById('addAntrmb').addEventListener("click", function(){
    var instance = M.Modal.getInstance(document.getElementById('modal-ant'));
    document.getElementById('form-ant-lat').value = lastLat;
    document.getElementById('form-ant-lng').value = lastLng;
    M.updateTextFields();
    instance.open();
  });

  document.getElementById('delAntrmb').addEventListener("click", function(){
    lastMarker.setMap(null);
  });

  document.getElementById('deleteBtn').addEventListener("click", function(){
    updateRFList();
  });

  document.getElementById('gpsBtn').addEventListener("click", function(){
    if (isFollowGps == true){
      console.log('gpsBtn');
      isFollowGps = false;
      document.getElementById('gpsBtn').innerHTML = '<i class="large material-icons">gps_off</i>'
      var instance = M.FloatingActionButton.getInstance(document.getElementById('mainBtn'));
      instance.close();
    } else {
      isFollowGps = true;
      startGPSLoop();
      document.getElementById('gpsBtn').innerHTML = '<i class="large material-icons">gps_fixed</i>'
      var instance = M.FloatingActionButton.getInstance(document.getElementById('mainBtn'));
      instance.close();
    }
  });

  document.getElementById('addBtn').addEventListener("click", function(){
    if (isFollowGps) {
      document.getElementById('form-rf-lat').value = lastLat;
      document.getElementById('form-rf-lng').value = lastLng;
      M.updateTextFields();
    }
  });

  document.getElementById('saveBtn').addEventListener("click", function(){
    saveVariable(saveData,'rf-heatmap.json');
  });

  document.getElementById('loadBtn').addEventListener("click", function(e){
    document.getElementById('file-input').click()
    document.getElementById('file-input').addEventListener('change', readFile, false);
  });

  function readFile (e) {
    if (!window.FileReader) return; // Browser is not compatible
    var reader = new FileReader();

    reader.onload = function (e) {
      if (e.target.readyState !== 2) return;
      if (e.target.error) {
        console.log('error');
        return;
      }

      clearAllData()
      saveData = JSON.parse(e.target.result);

      var lat,lng,amp,head,freq;
      var maxAmp = 0;
      for (var i = 0; i < saveData.length; i++) {
        amp = saveData[i].amp;
        if (amp > maxAmp) { maxAmp = amp;}
      }
      for (var i = 0; i < saveData.length; i++) {
        lat = saveData[i].lat;
        lng = saveData[i].lng;
        amp = saveData[i].amp;
        head = saveData[i].head;


        heatMapData.push({location: new google.maps.LatLng(lat, lng), weight: (amp/maxAmp), amp: amp, freq: freq});
        var markerIndex = heatMapData.length - 1;

        if (isNaN(head) == false && head != null) {
          var headLineCoords = [
            heatMapData[markerIndex].location,
            google.maps.geometry.spherical.computeOffset(heatMapData[markerIndex].location,HEADING_LINE_DISTANCE,head)
          ];

          var headLine = new google.maps.Polyline({
            path: headLineCoords,
            geodesic: true,
            strokeColor: '#FF0000',
            strokeOpacity: 1.0,
            strokeWeight: 2
          });
          headLine.setMap(map);
        } else {
          headLine = [];
        }

        // Add to the list so both Lists are equal in length
        headingLineData.push(headLine);
      }
      reloadHeatmapData();
      localStorage.setItem("saveData", JSON.stringify(saveData));
    };
    reader.readAsText(e.target.files[0]);
  }

  document.getElementById('curRF').addEventListener("click", function(evt){
    var markerIndex = parseInt(evt.target.getAttribute('rfid'));
    heatMapData.splice(markerIndex,1);
    try {
      headingLineData[markerIndex].setMap(null);
    } catch (e) {}
    headingLineData.splice(markerIndex,1);
    saveData.splice(markerIndex,1);
    reloadHeatmapData();
    updateRFList();
  });
})();
function initMap() {
  if (DEBUG_MODE) console.log(`${Date.now()}: initMap()`);
  // Initialize Material Library Functions
  M.AutoInit();
  var instances = M.Dropdown.init(document.getElementById('rightClickTrigger-map'), {constrainWidth: false});
  var instances = M.Dropdown.init(document.getElementById('rightClickTrigger-ant'), {constrainWidth: false});

  // Load Settings from Last Use
  var lastZoom = JSON.parse(localStorage.getItem("lastZoom"));
  if (lastZoom == null) {
    lastZoom = 16;
  }
  var lastLoc = JSON.parse(localStorage.getItem("lastLoc"));
  if (lastLoc == null) {
    lastLoc = {lat: 42.184467, lng: -70.929094};
  }
  heatmapRadius = JSON.parse(localStorage.getItem("heatmapRadius"));
  if (heatmapRadius == null) {
    heatmapRadius = 300;
  }
  heatmapIntensity = JSON.parse(localStorage.getItem("heatmapIntensity"));
  if (heatmapIntensity == null) {
    heatmapIntensity = 10;
  }

  // Disable Standard Right Click
  document.addEventListener('contextmenu', event => event.preventDefault());

  // Create a new map object using Google Map API
  map = new google.maps.Map(document.getElementById('map'), {
    center: lastLoc,
    // mapTypeId: 'roadmap',
    // mapTypeId: 'satellite',
    // mapTypeId: 'hybrid',
    mapTypeId: 'terrain',
    styles: [
      {
        featureType: 'poi',
        elementType: 'labels',
        stylers: [{visibility: 'off'}]
      },
      {
        "elementType": "geometry",
        "stylers": [
          {
            "color": "#ebe3cd"
          }
        ]
      },
      {
        "elementType": "labels",
        "stylers": [
          {
            "visibility": "off"
          }
        ]
      },
      {
        "elementType": "labels.text.fill",
        "stylers": [
          {
            "color": "#523735"
          }
        ]
      },
      {
        "elementType": "labels.text.stroke",
        "stylers": [
          {
            "color": "#f5f1e6"
          }
        ]
      },
      {
        "featureType": "administrative",
        "elementType": "geometry",
        "stylers": [
          {
            "color": "#c9b2a6"
          }
        ]
      },
      {
        "featureType": "landscape.natural",
        "elementType": "geometry",
        "stylers": [
          {
            "color": "#dfd2ae"
          }
        ]
      },
      {
        "featureType": "poi",
        "elementType": "labels.text.fill",
        "stylers": [
          {
            "color": "#93817c"
          }
        ]
      },
      {
        "featureType": "poi.park",
        "elementType": "geometry.fill",
        "stylers": [
          {
            "color": "#a5b076"
          }
        ]
      },
      {
        "featureType": "poi.park",
        "elementType": "labels.text.fill",
        "stylers": [
          {
            "color": "#447530"
          }
        ]
      },
      {
        "featureType": "road",
        "elementType": "geometry",
        "stylers": [
          {
            "color": "#f5f1e6"
          }
        ]
      },
      {
        "featureType": "road.arterial",
        "elementType": "geometry",
        "stylers": [
          {
            "color": "#fdfcf8"
          }
        ]
      },
      {
        "featureType": "road.highway",
        "elementType": "geometry",
        "stylers": [
          {
            "color": "#f8c967"
          }
        ]
      },
      {
        "featureType": "road.highway",
        "elementType": "geometry.stroke",
        "stylers": [
          {
            "color": "#e9bc62"
          }
        ]
      },
      {
        "featureType": "road.highway.controlled_access",
        "elementType": "geometry",
        "stylers": [
          {
            "color": "#e98d58"
          }
        ]
      },
      {
        "featureType": "road.highway.controlled_access",
        "elementType": "geometry.stroke",
        "stylers": [
          {
            "color": "#db8555"
          }
        ]
      },
      {
        "featureType": "road.local",
        "elementType": "labels.text.fill",
        "stylers": [
          {
            "color": "#806b63"
          }
        ]
      },
      {
        "featureType": "transit.line",
        "elementType": "geometry",
        "stylers": [
          {
            "color": "#dfd2ae"
          }
        ]
      },
      {
        "featureType": "transit.line",
        "elementType": "labels.text.fill",
        "stylers": [
          {
            "color": "#8f7d77"
          }
        ]
      },
      {
        "featureType": "transit.line",
        "elementType": "labels.text.stroke",
        "stylers": [
          {
            "color": "#ebe3cd"
          }
        ]
      },
      {
        "featureType": "transit.station",
        "elementType": "geometry",
        "stylers": [
          {
            "color": "#dfd2ae"
          }
        ]
      },
      {
        "featureType": "water",
        "elementType": "geometry.fill",
        "stylers": [
          {
            "color": "#b9d3c2"
          }
        ]
      },
      {
        "featureType": "water",
        "elementType": "labels.text.fill",
        "stylers": [
          {
            "color": "#92998d"
          }
        ]
      }
    ],
    streetViewControl: false,
    mapTypeControl: false,
    fullscreenControl: false,
    zoom: lastZoom,
    zoomControl: true,
    zoomControlOptions: {
      position: google.maps.ControlPosition.LEFT_BOTTOM
    }
  });

  // Setup Right Click and Tap Menus
  if (window.screen.width < 800) {
    map.addListener('click', function(e) {
      if (DEBUG_MODE) console.log(`${Date.now()}: map.addListener('click', function(e)`);
      if (DEBUG_MODE) console.log(e);
      lastLat = e.latLng.lat()
      lastLng = e.latLng.lng()
    });
    document.body.addEventListener('touchstart', function(e) {
      if (DEBUG_MODE) console.log(`${Date.now()}: document.body.addEventListener('touchstart', function(e)`);
      if (DEBUG_MODE) console.log(e);
      touchPos = e;
    });
    document.body.addEventListener('touchend', function (e) {
      if (DEBUG_MODE) console.log(`${Date.now()}: document.body.addEventListener('touchend', function (e)`);
      if (DEBUG_MODE) console.log(e);
      console.log(isMoving);
      if (e.target.localName == 'div' && !isMoving) {
        dropdownMenus = document.querySelectorAll('.dropdown-trigger');
        for (var i = 0; i < dropdownMenus.length; i++) {
          M.Dropdown.getInstance(dropdownMenus[i]).close();
        }

        var instance = M.Dropdown.getInstance(document.getElementById('rightClickTrigger-map'));
        instance.open();

        var rcm = document.getElementById('rightClickMenu-map');
        if (touchPos.touches[0].clientX < (window.screen.width / 2)) {
          rcm.style.left = `${touchPos.touches[0].clientX}px`;
        } else {
          rcm.style.left = `${touchPos.touches[0].clientX - document.getElementById('rightClickMenu-map').offsetWidth}px`;
        }
        if (touchPos.touches[0].clientY < (window.screen.height / 2)) {
          rcm.style.top = `${touchPos.touches[0].clientY}px`;
        } else {
          rcm.style.top = `${touchPos.touches[0].clientY - document.getElementById('rightClickMenu-map').offsetHeight}px`;
        }
      }
    });
  } else {
    map.addListener('rightclick', function(e) {
      if (DEBUG_MODE) console.log(`${Date.now()}: map.addListener('rightclick', function(e)`);
      if (DEBUG_MODE) console.log(e);
      // Close open
      dropdownMenus = document.querySelectorAll('.dropdown-trigger');
      for (var i = 0; i < dropdownMenus.length; i++) {
        M.Dropdown.getInstance(dropdownMenus[i]).close();
      }

      var instance = M.Dropdown.getInstance(document.getElementById('rightClickTrigger-map'));
      instance.open();
      var rcm = document.getElementById('rightClickMenu-map');
      if (e.tb.clientX < (window.screen.width / 2)) {
        rcm.style.left = `${e.tb.clientX}px`;
      } else {
        rcm.style.left = `${e.tb.clientX - document.getElementById('rightClickMenu-map').offsetWidth}px`;
      }
      if (e.tb.clientY < (window.screen.height / 2)) {
        rcm.style.top = `${e.tb.clientY}px`;
      } else {
        rcm.style.top = `${e.tb.clientY - document.getElementById('rightClickMenu-map').offsetHeight}px`;
      }
      lastLat = e.latLng.lat()
      lastLng = e.latLng.lng()
    });
  }

  // Setup Responses to Movement and Zooming
  map.addListener('center_changed', function(e) {
    if (!forceGPS) {
      isFollowGps = false;
      document.getElementById('gpsBtn').innerHTML = '<i class="large material-icons">gps_off</i>'
    }

    localStorage.setItem("lastLoc", JSON.stringify({lat: map.center.lat(), lng: map.center.lng()}));
    isMoving = true;
    setTimeout(function () {
      isMoving = false;
    }, 1000);
  });
  map.addListener('zoom_changed', function(e) {
    localStorage.setItem("lastZoom", JSON.stringify(map.zoom));
  });

  // Create the DIV to hold the control and call the IncreaseRadiusControl()
  // constructor passing in this DIV.
  var increaseRadiusControlDiv = document.createElement('div');
  var increaseRadiusControl = new IncreaseRadiusControl(increaseRadiusControlDiv, map);

  // Create the DIV to hold the control and call the IncreaseRadiusControl()
  // constructor passing in this DIV.
  var decreaseRadiusControlDiv = document.createElement('div');
  var decreaseRadiusControl = new DecreaseRadiusControl(decreaseRadiusControlDiv, map);

  increaseRadiusControlDiv.index = 1;
  decreaseRadiusControlDiv.index = 1;
  map.controls[google.maps.ControlPosition.LEFT_CENTER].push(increaseRadiusControlDiv);
  map.controls[google.maps.ControlPosition.LEFT_CENTER].push(decreaseRadiusControlDiv);

  // Create the DIV to hold the control and call the IncreaseRadiusControl()
  // constructor passing in this DIV.
  var increaseIntensityControlDiv = document.createElement('div');
  var increaseIntensityControl = new IncreaseIntensityControl(increaseIntensityControlDiv, map);

  // Create the DIV to hold the control and call the IncreaseIntensityControl()
  // constructor passing in this DIV.
  var decreaseIntensityControlDiv = document.createElement('div');
  var decreaseIntensityControl = new DecreaseIntensityControl(decreaseIntensityControlDiv, map);

  increaseIntensityControlDiv.index = 1;
  decreaseIntensityControlDiv.index = 1;
  map.controls[google.maps.ControlPosition.LEFT_TOP].push(increaseIntensityControlDiv);
  map.controls[google.maps.ControlPosition.LEFT_TOP].push(decreaseIntensityControlDiv);

  var heatmap = new google.maps.visualization.HeatmapLayer({
    data: heatMapData,
    radius: heatmapRadius,
    maxIntensity: heatmapIntensity,
  });

  heatmap.setMap(map);

  // Reload Last Map
  saveData = JSON.parse(localStorage.getItem("saveData"));
  if (saveData != null) {
    var lat,lng,amp,head,freq;
    var maxAmp = 0;
    for (var i = 0; i < saveData.length; i++) {
      amp = saveData[i].amp;
      if (amp > maxAmp) { maxAmp = amp;}
    }
    for (var i = 0; i < saveData.length; i++) {
      lat = saveData[i].lat;
      lng = saveData[i].lng;
      amp = saveData[i].amp;
      head = saveData[i].head;
      freq = saveData[i].freq;


      heatMapData.push({location: new google.maps.LatLng(lat, lng), weight: (amp/maxAmp), amp: amp, freq: freq});
      var markerIndex = heatMapData.length - 1;

      if (isNaN(head) == false && head != null) {
        var headLineCoords = [
          heatMapData[markerIndex].location,
          google.maps.geometry.spherical.computeOffset(heatMapData[markerIndex].location,HEADING_LINE_DISTANCE,head)
        ];

        var headLine = new google.maps.Polyline({
          path: headLineCoords,
          geodesic: true,
          strokeColor: '#FF0000',
          strokeOpacity: 1.0,
          strokeWeight: 2
        });
        headLine.setMap(map);
      } else {
        headLine = [];
      }

      // Add to the list so both Lists are equal in length
      headingLineData.push(headLine);
    }
    reloadHeatmapData();
  } else {
    saveData = [];
  }

  // Reload Antenna DATA
  antMapData = JSON.parse(localStorage.getItem("antMapData"));
  if (antMapData != null) {
    for (var i = 0; i < antMapData.length; i++) {
      var antLoc = {lat: antMapData[i].lat, lng: antMapData[i].lng};
      var marker = new google.maps.Marker({position: antLoc, map: map});
      marker.addListener('rightclick', function(e) {
        // Close open
        dropdownMenus = document.querySelectorAll('.dropdown-trigger');
        for (var i = 0; i < dropdownMenus.length; i++) {
          M.Dropdown.getInstance(dropdownMenus[i]).close();
        }

        var instance = M.Dropdown.getInstance(document.getElementById('rightClickTrigger-ant'));
        instance.open();
        var rcm = document.getElementById('rightClickMenu-ant');
        rcm.style.left = `${e.tb.clientX}px`;
        rcm.style.top = `${e.tb.clientY}px`;
        lastLat = e.latLng.lat()
        lastLng = e.latLng.lng()
        lastMarker = marker;
      });
    }
  } else {
    antMapData = [];
  }

  // Start in GPS Follow Mode
  // startGPSLoop();

  window.heatmap = heatmap;
  window.heatMapData = heatMapData;
}
function reloadHeatmapData () {
  if (DEBUG_MODE) console.log(`${Date.now()}: reloadHeatmapData()`);
  if (typeof heatmap != 'undefined') {
    heatmap.setOptions({data:heatMapData});
  }
}

function IncreaseIntensityControl(controlDiv, map) {
  if (DEBUG_MODE) console.log(`${Date.now()}: IncreaseIntensityControl()`);
  // Set CSS for the control border.
  var controlUI = document.createElement('div');
  controlUI.style.backgroundColor = '#fff';
  controlUI.style.border = '2px solid #fff';
  controlUI.style.borderRadius = '3px';
  controlUI.style.boxShadow = '0 2px 6px rgba(0,0,0,.3)';
  controlUI.style.cursor = 'pointer';
  controlUI.style.marginLeft = '10px';
  controlUI.style.marginTop = '10px';
  controlUI.style.marginBottom = '5px';
  controlUI.style.textAlign = 'center';
  controlUI.title = 'Increase Intensity';
  controlDiv.appendChild(controlUI);

  // Set CSS for the control interior.
  var controlText = document.createElement('div');
  controlText.style.color = 'rgba(1,1,1,0.6)';
  controlText.style.fontFamily = 'Roboto,Arial,sans-serif';
  controlText.style.fontSize = '3rem';
  controlText.style.fontWeight = '400';
  controlText.style.width = '40px';
  controlText.style.height = '40px';
  controlText.innerHTML = '<i class="material-icons" style="font-Size: 43px;">expand_less</i>';
  controlUI.appendChild(controlText);

  // Setup the click event listeners: simply set the map to Chicago.
  controlUI.addEventListener('click', function() {
    heatmapIntensity = Math.max(heatmapIntensity - 1, 2);
    if (DEBUG_MODE) console.log(`${Date.now()}: heatmapIntensity - ${heatmapIntensity}`);
    heatmap.setOptions({maxIntensity:heatmapIntensity});
    localStorage.setItem("heatmapIntensity", JSON.stringify(heatmapIntensity));
  });
}
function DecreaseIntensityControl(controlDiv, map) {
  if (DEBUG_MODE) console.log(`${Date.now()}: DecreaseIntensityControl()`);
  // Set CSS for the control border.
  var controlUI = document.createElement('div');
  controlUI.style.backgroundColor = '#fff';
  controlUI.style.border = '2px solid #fff';
  controlUI.style.borderRadius = '3px';
  controlUI.style.boxShadow = '0 2px 6px rgba(0,0,0,.3)';
  controlUI.style.cursor = 'pointer';
  controlUI.style.marginLeft = '10px';
  controlUI.style.textAlign = 'center';
  controlUI.title = 'Decrease Intensity';
  controlDiv.appendChild(controlUI);

  // Set CSS for the control interior.
  var controlText = document.createElement('div');
  controlText.style.color = 'rgba(1,1,1,0.6)';
  controlText.style.fontFamily = 'Roboto,Arial,sans-serif';
  controlText.style.fontSize = '3rem';
  controlText.style.fontWeight = '400';
  controlText.style.width = '40px';
  controlText.style.height = '40px';
  controlText.innerHTML = '<i class="material-icons" style="font-Size: 43px;">expand_more</i>';
  controlUI.appendChild(controlText);

  // Setup the click event listeners: simply set the map to Chicago.
  controlUI.addEventListener('click', function() {
    heatmapIntensity = Math.min(heatmapIntensity + 1, 50);
    if (DEBUG_MODE) console.log(`${Date.now()}: heatmapIntensity - ${heatmapIntensity}`);
    heatmap.setOptions({maxIntensity:heatmapIntensity});
    localStorage.setItem("heatmapIntensity", JSON.stringify(heatmapIntensity));
  });
}
function IncreaseRadiusControl(controlDiv, map) {
  if (DEBUG_MODE) console.log(`${Date.now()}: IncreaseRadiusControl()`);
  // Set CSS for the control border.
  var controlUI = document.createElement('div');
  controlUI.style.backgroundColor = '#fff';
  controlUI.style.border = '2px solid #fff';
  controlUI.style.borderRadius = '3px';
  controlUI.style.boxShadow = '0 2px 6px rgba(0,0,0,.3)';
  controlUI.style.cursor = 'pointer';
  controlUI.style.marginLeft = '10px';
  controlUI.style.marginBottom = '5px';
  controlUI.style.textAlign = 'center';
  controlUI.title = 'Increase Radius';
  controlDiv.appendChild(controlUI);

  // Set CSS for the control interior.
  var controlText = document.createElement('div');
  controlText.style.color = 'rgba(1,1,1,0.6)';
  controlText.style.fontFamily = 'Roboto,Arial,sans-serif';
  controlText.style.fontSize = '30px';
  controlText.style.fontWeight = '400';
  controlText.style.width = '40px';
  controlText.style.height = '40px';
  controlText.innerHTML = '▲';
  controlUI.appendChild(controlText);

  // Setup the click event listeners: simply set the map to Chicago.
  controlUI.addEventListener('click', function() {
    heatmapRadius = heatmapRadius * 1.1;
    heatmap.setOptions({radius:heatmapRadius});
    localStorage.setItem("heatmapRadius", JSON.stringify(heatmapRadius));
  });
}
function DecreaseRadiusControl(controlDiv, map) {
  if (DEBUG_MODE) console.log(`${Date.now()}: DecreaseRadiusControl()`);
  // Set CSS for the control border.
  var controlUI = document.createElement('div');
  controlUI.style.backgroundColor = '#fff';
  controlUI.style.border = '2px solid #fff';
  controlUI.style.borderRadius = '3px';
  controlUI.style.boxShadow = '0 2px 6px rgba(0,0,0,.3)';
  controlUI.style.cursor = 'pointer';
  controlUI.style.marginLeft = '10px';
  controlUI.style.textAlign = 'center';
  controlUI.title = 'Decrease Radius';
  controlDiv.appendChild(controlUI);

  // Set CSS for the control interior.
  var controlText = document.createElement('div');
  controlText.style.color = 'rgba(1,1,1,0.6)';
  controlText.style.fontFamily = 'Roboto,Arial,sans-serif';
  controlText.style.fontSize = '30px';
  controlText.style.fontWeight = '400';
  controlText.style.width = '40px';
  controlText.style.height = '40px';
  controlText.innerHTML = '▼';
  controlUI.appendChild(controlText);

  // Setup the click event listeners: simply set the map to Chicago.
  controlUI.addEventListener('click', function() {
    heatmapRadius = heatmapRadius * 0.9;
    heatmap.setOptions({radius:heatmapRadius});
    localStorage.setItem("heatmapRadius", JSON.stringify(heatmapRadius));
  });
}


function startGPSLoop () {
  if (!isFollowGps) {
    return;
  }
  navigator.geolocation.getCurrentPosition(function (pos) {
      var lat = pos.coords.latitude;
      var lng = pos.coords.longitude;
      if (lat == null) {
          console.log(pos.coords);
          isFollowGps = false;
          document.getElementById('gpsBtn').innerHTML = '<i class="large material-icons">gps_off</i>'
          M.toast({html: 'GPS Not Available Anymore!'})
          return;
      } else {
          lastLat = lat;
          lastLng = lng;
          lastLoc = {lat: lat, lng: lng};
          // M.toast({html: `lat: ${lat}\nlng: ${lng}`})
          forceGPS = true;
          map.setOptions({center: lastLoc});
          forceGPS = false;
          setTimeout(function () {
            startGPSLoop();
          }, 500);
      }
  });
}
function updateRFList () {
  var element = document.getElementById('curRF');
  element.innerHTML = "";
  for (var i = 0; i < heatMapData.length; i++) {
    var heading;
    try {
      heading = parseInt(google.maps.geometry.spherical.computeHeading(headingLineData[i].getPath().i[0],headingLineData[i].getPath().i[1]).toFixed());
    } catch (e) {
      heading = 'N/A'
    }
    element.innerHTML += `<a rfid="${i}" href="#!" class="collection-item">Measurement #${i}</br>
                                                                           Latitude: ${heatMapData[i].location.lat()}</br>
                                                                           Longitude: ${heatMapData[i].location.lng()}</br>
                                                                           Frequency (Mhz): ${heatMapData[i].freq}</br>
                                                                           Amplitude: ${heatMapData[i].amp - 100}</br>
                                                                           Heading: ${heading}</a>`
  }

  localStorage.setItem("saveData", JSON.stringify(saveData));
}
function addRFtoMap () {
  if (DEBUG_MODE) console.log(`${Date.now()}: addRFtoMap()`);
  lat = parseFloat(document.getElementById('form-rf-lat').value);
  lng = parseFloat(document.getElementById('form-rf-lng').value);
  if (document.getElementById('form-rf-amp').value == '') {
    M.toast({html: 'Amplitude Required!'})
    clearAddRFForm();
    return;
  }
  amp = parseFloat(document.getElementById('form-rf-amp').value) + 100; // No Negatives
  if (isNaN(amp)) {
    M.toast({html: 'Amplitude Must Be a Number!'})
    clearAddRFForm();
    return;
  }
  if (amp <= 0) {
    M.toast({html: 'Amplitude Must Be Greater Than -100!'})
    clearAddRFForm();
    return;
  }
  head = parseFloat(document.getElementById('form-rf-head').value);
  if ((document.getElementById('form-rf-head').value != '') && isNaN(head)) {
    M.toast({html: 'Heading Must Be a Number!'})
    clearAddRFForm();
    return;
  }
  var maxAmp = amp;
  for (var i = 0; i < heatMapData.length; i++) {
    ampTemp = heatMapData[i].amp;
    if (ampTemp > maxAmp) { maxAmp = ampTemp;}
  }
  freq = parseFloat(document.getElementById('form-rf-freq').value); // TODO: Error Checking

  heatMapData.push({location: new google.maps.LatLng(lat, lng), weight: (amp/maxAmp), amp: amp, freq: freq});
  var markerIndex = heatMapData.length - 1;
  reloadHeatmapData();

  if (isNaN(head) == false) {
    var headLineCoords = [
            heatMapData[markerIndex].location,
            google.maps.geometry.spherical.computeOffset(heatMapData[markerIndex].location,HEADING_LINE_DISTANCE,head)
          ];

    var headLine = new google.maps.Polyline({
      path: headLineCoords,
      geodesic: true,
      strokeColor: '#FF0000',
      strokeOpacity: 1.0,
      strokeWeight: 2
    });
    headLine.setMap(map);
  } else {
    headLine = [];
  }

  // Add to the list so both Lists are equal in length
  headingLineData.push(headLine);
  saveData.push({
    lat: lat,
    lng: lng,
    amp: amp,
    head: head,
    freq: freq
  });

  localStorage.setItem("saveData", JSON.stringify(saveData));
  clearAddRFForm();
}
function addAntToMap () {
  if (DEBUG_MODE) console.log(`${Date.now()}: addAntToMap()`);
  lat = parseFloat(document.getElementById('form-ant-lat').value);
  lng = parseFloat(document.getElementById('form-ant-lng').value);
  var antLoc = {lat: lat, lng: lng};
  antMapData.push(antLoc);
  var marker = new google.maps.Marker({position: antLoc, map: map});

  marker.addListener('rightclick', function(e) {
    // Close open
    dropdownMenus = document.querySelectorAll('.dropdown-trigger');
    for (var i = 0; i < dropdownMenus.length; i++) {
      M.Dropdown.getInstance(dropdownMenus[i]).close();
    }

    var instance = M.Dropdown.getInstance(document.getElementById('rightClickTrigger-ant'));
    instance.open();
    var rcm = document.getElementById('rightClickMenu-ant');
    rcm.style.left = `${e.tb.clientX}px`;
    rcm.style.top = `${e.tb.clientY}px`;
    lastLat = e.latLng.lat()
    lastLng = e.latLng.lng()
    lastMarker = marker;
  });

  localStorage.setItem("antMapData", JSON.stringify(antMapData));
  clearAddAntForm();
}
function clearAddRFForm() {
  if (DEBUG_MODE) console.log(`${Date.now()}: clearAddRFForm()`);
  // Reset form 200ms later to ensure modal is gone
  setTimeout(function () {
    document.getElementById('form-rf-lat').value = '';
    document.getElementById('form-rf-lng').value = '';
    document.getElementById('form-rf-amp').value = '';
    document.getElementById('form-rf-head').value = '';
  }, 200);
}
function clearAddAntForm() {
  if (DEBUG_MODE) console.log(`${Date.now()}: clearAddAntForm()`);
  // Reset form 200ms later to ensure modal is gone
  setTimeout(function () {
    document.getElementById('form-ant-lat').value = '';
    document.getElementById('form-ant-lng').value = '';
  }, 200);
}
function clearAllData() {
  if (DEBUG_MODE) console.log(`${Date.now()}: clearAllData()`);
  for (var markerIndex = heatMapData.length; markerIndex >= 0; markerIndex--) {
    heatMapData.splice(markerIndex,1);
    try {
      headingLineData[markerIndex].setMap(null);
    } catch (e) {}
    headingLineData.splice(markerIndex,1);
    saveData.splice(markerIndex,1);
    reloadHeatmapData();
  }
  updateRFList();
}
function saveVariable (variable, name) {
  if (DEBUG_MODE) console.log(`${Date.now()}: saveVariable()`);
  variable = JSON.stringify(variable);
  var blob = new Blob([variable], {type: 'text/plain;charset=utf-8'});
  saveAs(blob, name);
}
