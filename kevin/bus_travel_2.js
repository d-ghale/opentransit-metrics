// python -m http.server
function queryUrl(startTime, endTime, route){
    return `https://06o8rkohub.execute-api.us-west-2.amazonaws.com/dev/graphql?query={
        trynState(
          agency: "muni",
          startTime: "${startTime}",
          endTime:   "${endTime}",
          routes: ["${route}"]
        ) {
          agency
          startTime
          endTime
          routes {
            rid
            stops {
              sid
              name
              lat
              lon
            }
            routeStates {
              vtime
              vehicles {
                vid
                lat
                lon
              }
            }
          }
        }
      }`.split('{').join('%7B').split('}').join('%7D');
}
var busUrl = queryUrl(1539696442179,1539696599179,14);
var routesUrl = 'https://raw.githubusercontent.com/trynmaps/opentransit-map/master/src/res/muniRoutes2.json';

var busLayer = L.layerGroup();
var stopLayer = L.layerGroup();
var routeLine = L.layerGroup();
// var streetmap = L.tileLayer('https://b.tile.openstreetmap.org/{z}/{x}/{y}.png');
var streetmap = L.tileLayer('https://maps.wikimedia.org/osm-intl/{z}/{x}/{y}.png');
var busDots = {};
var busKeys = {};
var routePaths = {};
var route;
var t0;

var animLength = 10;

var speedFactor = 15;
var looping = false;

var queryStartTime = 1539696442179;
var queryEndTime = 1539696599179;

d3.json(routesUrl,response=>{
    for (let r of response.features){
        routePaths[r.properties.name] = r;
    }
    // Add route dropdown
    var dropdown = L.control({position:'bottomright'});
    dropdown.onAdd = map =>{
        var div = L.DomUtil.create('div','info legend');
        var $div = d3.select(div);
        $div.style('margin-bottom','10px');

        $div.append('p').attr('id','query-date')
            .style('font-weight','normal')
            .style('margin-top','5px')
            .style('margin-bottom','5px');

        $routeDiv=$div.append('div').text('Route: ');

        $routeDiv.append('select').selectAll('option')
            .data(Object.keys(routePaths))
            .enter().append('option')
            .attr('id',d=>'route'+d)
            .text(d=>d);

        $div.select('#route14').attr('selected','selected');
        var routeSelect = div.getElementsByTagName('select')[0];

        $routeDiv.append('button')
            .attr('type','button').text('Submit')
            .on('mouseup',()=>{
                let rid = routeSelect.options[routeSelect.selectedIndex].value;
                let params = [queryStartTime,queryEndTime,rid];
                loadBus(...params);
            });
        L.DomEvent.on(div, 'mousedown', e=>L.DomEvent.stopPropagation(e))
        // div.onmousedown = L.DomEvent.stopPropagation;
        
        return div;
    };
    dropdown.addTo(map);
    newQueryDates();
});

function newQueryDates(){
    d3.select('#query-date')
        .html(`<b>Start:</b> ${new Date(queryStartTime).toLocaleString()} <br/>` +
        `<b>End:</b> ${new Date(queryEndTime).toLocaleString()} <br/>`);
}

function loadBus(startTime, endTime, route, dedupKeys=false){
    busUrl = queryUrl(startTime,endTime,route);
    queryStartTime = startTime;
    queryEndTime = endTime;
    d3.json(busUrl,(error, response)=>{
        // console.log(response);
        let routeObj = response.data.trynState.routes[0];
        if (!routeObj) {
            return console.warn('Query did not return any routes');
        }

        route = routeObj.routeStates;
        let stops = routeObj.stops;
        // console.log(route[0].vehicles[0]);
        route.sort((t1,t2)=>(+t1.vtime-+t2.vtime));

        animLength = route.length;
        let tMin = d3.min(route,d=>+d.vtime);

        function timeTransform(t){
            return (+t-tMin)/15000;
        }
        busLayer.clearLayers();
        stopLayer.clearLayers();
        routeLine.clearLayers();
        busKeys = {};
        busDots = {};
        // Generate bus keyframes
        for (let rs of route){
            // console.log(timeTransform(rs.vtime));
            for (let v of rs.vehicles){
                if (!(v.vid in busKeys)) {
                    busKeys[v.vid]=[];
                    // Add circles
                    let c = L.circle([v.lat,v.lon],
                        {color: 'black'});
                    c.bindPopup(`<p>Bus # ${v.vid}</p>`)
                    c.addTo(busLayer);
                    busDots[v.vid]=c;
                }

                let bk = busKeys[v.vid];
                // Remove repeated keyframes for smoother motion
                let [lon1,lat1] = [+v.lon, +v.lat];
                if (bk.length>=1) {
                    let [t,lon0,lat0] = bk[bk.length-1];
                    if (dedupKeys && lon0==lon1 && lat0==lat1) continue;
                }

                bk.push([timeTransform(rs.vtime),lon1,lat1]);
            }
        }

        for (let s of stops){
            L.circle([s.lat,s.lon],
                {color: 'blue',
                radius: 5,
                weight: 1}
            ).addTo(stopLayer)
            .bindPopup(`<p>${s.name}</p>`);
        }
        L.geoJSON(routePaths[routeObj.rid],{
            weight: 1.5,
            opacity: .5,
            color: 'red',
        }).addTo(routeLine)
        .bindPopup(`<p>Route ${routeObj.rid}</p>`);
        newQueryDates();
        t0 = Date.now();
    });
}
loadBus(1539696442179,1539696599179,14);

function resetTime(){
    t0 = Date.now();
}

// Map layers
var baseMaps = {
    "Light Map": streetmap,
};

var overlayMaps = {
    "Route": routeLine,
    "Buses": busLayer,
    "Stops": stopLayer,
};

var map = L.map("map", {
    center: [
      37.78, -122.44
    ],
    zoom: 13,
    layers: [streetmap, routeLine, stopLayer, busLayer]
});

function updateBuses(){
    let time = (Date.now()-t0)*1e-3*speedFactor/15;
    
    for (let vid in busKeys){
        let c = busDots[vid];
        let [lon,lat] = keyPath(busKeys[vid],time);
        c.setLatLng(new L.LatLng(lat,lon));
    }
    
    if (looping && time > animLength) t0 = Date.now();
}

setInterval(updateBuses,10);

// @CutnPaste from motion_trails1.js
const T_EPSILON = 1e-8;
// keys object looks like [[t1,x1,y1],[t2,x2,y2],...]
function keyPath(keys, time){
    if (time <= keys[0][0]) {
        let [t,x,y]=keys[0]
        return [x,y];
    }

    for (let k=0; k<keys.length; k++){
        let key = keys[k];

        // t is past last timestamp
        if (k==keys.length-1 && time>key[0]) {
            let [t,x,y]=key;
            return [x,y];
        }
        if (key[0]<time) continue;
        // Must be between k-1 and k
        let [t1,x1,y1] = keys[k-1];
        let [t2,x2,y2] = key;

        // If interval is (essentially) zero
        if (t2-t1< T_EPSILON) {
            return [x2,y2];
        }

        let tNorm = (time - t1)/(t2-t1);
        return arrayLerp([x1,y1],[x2,y2],tNorm);
    }
}

function lerp(a,b,t){
    return a+t*(b-a);
}

function arrayLerp(a1, a2, t){
    return a1.map((d,i)=>lerp(d, a2[i], t));
}

L.control.layers(baseMaps,overlayMaps,{collapsed: false}).addTo(map);

/*
var count = 0;
function updateBuses(){
    count++
    if (count >= route.length) count = 0;
    for (let v of route[count].vehicles){
        let c = busDots[v.vid];
        c.setLatLng(new L.LatLng(v.lat,v.lon));
    }
}*/
