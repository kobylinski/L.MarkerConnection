L.MarkerConnection = {
    circleTemplate: _.template(
        '<svg width="<%- r %>px" height="<%- r %>px" viewBox="0 0 <%- r %> <%- r %>" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">' +
            '<circle cx="<%- r/2 %>" cy="<%- r/2 %>" r="<%- (r/2 - strokeWidth) %>" style="fill: <%- iconColor %>;  stroke: <%- strokeColor %>; stroke-width: <%- strokeWidth %>"/>'+
        '</svg>'
    )
};

L.MarkerConnection.Circle = L.Icon.extend({
    options: {
        r: 20,
        iconColor: 'white',
        iconColorActive: 'red',
        strokeColor: 'red',
        strokeWidth: 3
    },

    initialize: function(options){
        options = L.Util.setOptions(this, options);
        options.size = [options.r, options.r];
        options.iconAnchor = [options.r/2, options.r/2];
        return options;
    },

    createIcon: function(oldIcon){
        var div = oldIcon && oldIcon.tagName.toLowerCase() == 'div' ? oldIcon : document.createElement('div');
        div.innerHTML = L.MarkerConnection.circleTemplate(this.options);
        this._setIconStyles(div, "icon");
        return div; 
    }
});

L.MarkerConnection.Connection = L.Polyline.extend({
    
    initialize:function(markers, options){
        L.setOptions(this, options);
        if(markers[0]) this.setStart(markers[0]);
        if(markers[1]) this.setEnd(markers[1]);
    },

    setStart: function(marker){
        this.startMarker = marker;
        this.updateConnection();
    },
    
    setEnd: function(marker){
        this.endMarker = marker;
        this.updateConnection();
    },

    updateConnection: function(){
        if(this.startMarker && this.endMarker){
            this.setLatLngs([this.startMarker.getLatLng(), this.endMarker.getLatLng()]);
        }else{
            this.setLatLngs([]);
        }
    },

    hasMarker: function(marker){
        return this.endMarker == marker || this.startMarker == marker;
    },

    isConnection: function(marker1, marker2){
        if(this.startMarker == marker1 && this.endMarker == marker2){
            return true;
        }

        return false;
    },

    getMarkers: function() {
        return {
            start: this.startMarker,
            end: this.endMarker
        }
    }
});

L.MarkerConnection.Elements = L.FeatureGroup.extend({
    initialize:function(layers){
        L.LayerGroup.prototype.initialize.call(this, layers);
        this.connections = L.featureGroup();
        this.selected = null;
        this.enabled = true;
        
        this.cursor = L.marker(null, {icon: new L.MarkerConnection.Circle(), zIndexOffset: -10});
        this.line = L.polyline([], {color: 'red', opacity: 1});

        this.on('click', function(e){
            if(this.enabled){
                this.selectMarker(e.layer);
            }
        });

        var _this = this;

        this.cursor.on('mousedown', function(e) {
            _this._map.on('mousemove', function(e){
                if(null === _this.selected) return false;
                var closest = L.GeometryUtil.closestLayerSnap(_this._map, _this.getLayers(), e.latlng, 20),
                    target = null !== closest && _this.selected != closest.layer && !_this.hasConnection(_this.selected, closest.layer) ? closest.layer.getLatLng() : e.latlng;

                _this.line.setLatLngs([_this.selected.getLatLng(), target]);
                _this.cursor.setLatLng(target);

            }).dragging.disable();

            this._map.on('mouseup', function(e){
                this.off('mousemove');
                this.off('mouseup');
                this.dragging.enable(); 

                var closest = L.GeometryUtil.closestLayerSnap(_this._map, _this.getLayers(), e.latlng, 20);
                if(null !== closest && !_this.hasConnection(_this.selected, closest.layer)){
                    _this._map.removeLayer(_this.line);
                    _this._map.removeLayer(_this.cursor);
                    _this.addConnection(_this.selected, closest.layer);
                    _this.selected = null;
                }else{
                    _this.selectMarker(_this.selected, _this.computeDirection(e.latlng));
                }
            });
        });

        this.connections.on('click', function(e){
            if(_this.enabled){
                this.removeLayer(e.layer);
            }
        });
    },

    addConnection: function(start, end){
        var connection = new L.MarkerConnection.Connection([start, end], {color: 'red', opacity: 1, strokeWidth: 1});
        this.connections.addLayer(connection);
    },

    getConnections: function(){
        var connections = [];
        this.connections.eachLayer(function(connection){
            connections.push(connection.getMarkers());
        });

        return connections;
    },

    enable:function()
    {
        this.enabled = true;
    },

    disable:function()
    {
        this._map.removeLayer(this.line);
        this._map.removeLayer(this.cursor);
        this.selected = null;
        this.enabled = false;
    },

    onAdd: function(map){
        L.LayerGroup.prototype.onAdd.call(this, map);
        this.connections.addTo(map);
    },

    onRemove: function(map){
        L.LayerGroup.prototype.onRemove.call(this, map);
        map.removeLayer(this.connections);
    },

    removeLayer: function(marker){
        L.FeatureGroup.prototype.removeLayer.call(this, marker);
        this.connections.eachLayer(function(connection){
            if(connection.hasMarker(marker)){
                this.connections.removeLayer(connection);
            }
        }, this);
        marker.off('drag', this.markerDrag)
    },

    addLayer: function(marker){
        L.FeatureGroup.prototype.addLayer.call(this, marker);
        marker.on('drag', this.markerDrag, this);
    },

    markerDrag: function(e){
        this.connections.eachLayer(function(connection){
            if(connection.hasMarker(e.target)){
                connection.updateConnection();
            }
        }, this);

        if(this.selected == e.target){
            this.selectMarker(this.selected);
        }
    },

    hasConnection: function(marker1, marker2){
        var result = false;
        this.connections.eachLayer(function(connection){
            if(connection.isConnection(marker1, marker2)){
                result = true;
            }
        }, this);

        return result;
    },

    selectMarker: function(marker, direction){

        var _mPos = marker.getLatLng(),
            _pPos, _nPos;

        if(direction){
            _nPos = this._map.unproject(direction);
        }else{
            var _pPos = this._map.project(_mPos);
            _pPos.x += 20;
            _pPos.y -= 20;
            _nPos = this._map.unproject(_pPos);
        }              

        this.cursor.setLatLng(_nPos);
        this.line.setLatLngs([_mPos, _nPos]);

        if(null === this.selected){
            this.cursor.addTo(this._map);
            this.line.addTo(this._map);
        }

        this.selected = marker;
    },

    computeDirection: function(point){
        
        var from    = this._map.project(this.selected.getLatLng()),
            to      = this._map.project(point),
            x       = from.x - to.x,
            y       = from.y - to.y,
            n       = Math.sqrt(
                        Math.pow(x, 2) + 
                        Math.pow(y, 2)
                    );
            
        return L.point(
            from.x + x/n * -25, 
            from.y + y/n * -25
        );
    }
})