var myApp = angular.module('myApp', ['ng-admin', 'uiGmapgoogle-maps']);

/**
 * CONFIG
*/

var URL = '';
var ACCOUNTSURL = ''; // Required for getEventIconUrl
var TOKEN = '';
var USERID = ''; // Required for getEventIconUrl
var SERVICEID = '';

var URL = 'https://beta.calendar42.com/app/django/api/v2';
var ACCOUNTSURL = 'https://beta.calendar42.com/accounts';          // Required for getEventIconUrl
var TOKEN = '';
var USERID = '';                    // Required for getEventIconUrl
// var SERVICEID = '';

/**
 * NG-ADMIN CUSTOMIZATIONS
*/

// C42 expects that /search always sends a search term in 1, otherwise it throws a 400
// TODO: Just handle the 400 correctly
var DEFAULTSEARCHTERM = "test";

// C42 expects URL's to always have a leading slash
var urlRewite = function (entityName, identifierValue, suffix) {
    return '/' + entityName + '/' + (identifierValue?identifierValue+"/":"") + (suffix?suffix+"/":"");
};

// C42 expects updates to be done with the patch Method
var updateMethod = 'patch';

var arrayToGeoCircleFormat = function (array) {
    /*
        Array   [lat,lon,distance]  => String   "(lat lon distance)"
        String  "lat,lon,distance"  => String   "(lat lon distance)"
    */
    if (!(array instanceof Array)) {
        // We might be getting in a string in the format of "lat,lon,distance"
        array = array.split(',');
    }
    if (array.length === 3) {
        return "(" + array[0] + " " + array[1]+ " " + array[2] + ")";
    }
    return "";
};

var getEventIconUrl = function(eventId) {
    /*
        String  "event-id" =>   String "https://alpha.calendar42.com/accounts/icons/event/{user-id}/{event-id}/"
    */
    return ACCOUNTSURL + "/icons/event/"+USERID+"/"+eventId+"/";
};

/**
 * RESTANGULAR CUSTOMIZATIONS
*/
myApp.config(['RestangularProvider', function (RestangularProvider) {
    // C42 expects a header for Authorization
    RestangularProvider.setDefaultHeaders({"Authorization": "Token "+TOKEN});

    RestangularProvider.addFullRequestInterceptor(function(element, operation, what, url, headers, params) {
        if (operation == 'getList') {
            // C42 pagination params are limit & offset
            if (params._page) {
                params.offset = (params._page - 1) * params._perPage;
                params.limit = params._perPage;
            }
            delete params._page;
            delete params._perPage;

            // C42 sorting params are order_by and order_by_asc
            if (params._sortField && params._sortField !== 'id') {
                params.order_by = params._sortField;
                params.order_by_asc = params._sortDir === 'ASC';
            }
            delete params._sortField;
            delete params._sortDir;
        }
        if (operation == 'patch') {
            // don't send along the id again in patch
            delete element.id;
            // C42 expects partial payloads in patch
            // C42 doesn't allow all fields to be null in patch, they should then not be send
            var nonNullFields = ['all_day','start', 'end','length','end_timezone','start_timezone','time_buffer','rsvp_status'];
            for (var i = nonNullFields.length - 1; i >= 0; i--) {
                if (element[nonNullFields[i]] === null) {
                    delete element[nonNullFields[i]];
                }
            }
        }
        if (operation == 'post' || operation == 'patch') {
            // In order to keep data consistent, we only allow to post or patch the location id
            // Not any other fields of the location, so we overwrite everything except the id
            if (element.start_location) {
                if (element.start_location.id) {
                    element.start_location = {
                        'id': element.start_location.id
                    };
                } else {
                    delete element.start_location;
                }
            }
            if (element.calendar_ids === null) {
                element.calendar_ids = [];
            }
        }
        // params.service_ids= '['+SERVICEID+']';
        
        /*
            C42 adds expects filers directly in the params and not inside an object in a `_filter` param
        */
        if (params._filters) {
            /*
                C42 uses array filters, that expect multiple values in an array
                The fields of ng-admin don't really support this out of the box, so in the view layer we
                pretend that they are singular filters (e.g. `id` instead of `ids`)
                This
            */
            var arrayFilterKeys = ['event_id', 'id', 'service_id', 'calendar_id', 'geo_circle', 'event_type', 'user_id'];
            for (var key in params._filters) {
                if (params._filters.hasOwnProperty(key)) {
                    if (arrayFilterKeys.indexOf(key) > -1 && !!params._filters[key]) {  // in arrayFilterKeys & defined
                        if (key === 'geo_circle' ) {
                            params._filters[key] = arrayToGeoCircleFormat(params._filters[key]);
                        }
                        params[key+'s'] = '[' + params._filters[key] + ']';
                    } else {
                        params[key] = params._filters[key];
                    }
                }
            }
        }
        delete params._filters;
        console.warn(params);
        return { params: params };
    });

    RestangularProvider.addResponseInterceptor(function(data, operation, what, url, response) {
        if (operation == "getList") {
            response.totalCount = data.meta_data.count;
            data = data.data;
        } else {
            data = data.data[0];
        }
        return data;
    });
}]);


/* 
    Google maps
*/
myApp.config(function (uiGmapGoogleMapApiProvider) {
    uiGmapGoogleMapApiProvider.configure({
        key: 'AIzaSyBrYbrn5tzt7F_rAML2jGVPgV4q2uz0oxg',
        v: '3',
        libraries: 'visualization'
    });});

myApp.directive('geocode', ['$location', function ($location) {
return {
    restrict: 'E',
    scope: {
        lat: '=lat',
        lon: '=lon',
    },
    link: function($scope, uiGmapIsReady) {
        var iLat, iLong;
        if ($scope.lat && $scope.lon)    {
            iLat  = parseFloat($scope.lat);
            iLong = parseFloat($scope.lon);
        }

        var maps = { center: { latitude: iLat, longitude: iLong }, zoom: 12 };

        $scope.map = maps;
        $scope.options = {scrollwheel: false};

        $scope.marker = {
            id: 0,
            coords: {
                latitude: iLat,
                longitude: iLong
            },
            options: { draggable: true },

            events: {
                dragend: function (marker, eventName, args) {
                    $scope.geocode.latitude  = marker.getPosition().lat();
                    $scope.geocode.longitude = marker.getPosition().lng();
                    var latlng = {lat: parseFloat($scope.geocode.latitude), lng: parseFloat($scope.geocode.longitude)};


                    $scope.marker.options = {
                        draggable: true,
                        labelContent: $scope.address,
                        labelAnchor: "100 0",
                        labelClass: "marker-labels"
                    };

                }
            }
        };

    },
    template: 
    `
    <div class="row list-view">
        <div class="col-lg-12">
            <ui-gmap-google-map center="map.center" zoom="map.zoom" draggable="true" options="options" pan=true  refresh="true">
                <ui-gmap-marker coords="marker.coords" options="marker.options" events="marker.events" idkey="marker.id">
                </ui-gmap-marker>
            </ui-gmap-google-map>
        </div>
    </div>
    `
};}]);


var eventTypeChoices = [
    { label: 'Normal', value: 'normal' },
    { label: 'task', value: 'todo' },
    { label: 'Time block', value: 'time_block' },
    { label: 'Trip (Arrive By)', value: 'arrive_by' },
    { label: 'Trip (Depart From)', value: 'depart_from' },
    { label: 'Route', value: 'route' }
];


/*
 * The actual admin config
*/
myApp.config(['NgAdminConfigurationProvider', function (nga) {
    var admin = nga.application('C42 Admin').baseApiUrl(URL);

    /*
    
        CUSTOM FIELDS

    */

    var C42EventAvatarField = nga.field('_local_avatar', 'template')
        .label('')
        .map(function createUrl(value, entry) {
            return getEventIconUrl(entry.id);
        })
        .template('<img class="img-rounded" src="{{ entry.values._local_avatar }}" width="24" height="24" style="margin-top:-2px" />');

    /* 

        ENTITIES

    */
    var service = nga.entity('services').url(function(entityName, viewType, identifierValue, identifierName) {
        return urlRewite(entityName, identifierValue, "public");
    });
    var calendar = nga.entity('calendars').url(function(entityName, viewType, identifierValue, identifierName) {
        return urlRewite(entityName, identifierValue);
    });
    var location = nga.entity('locations').url(function(entityName, viewType, identifierValue, identifierName) {
        return urlRewite(entityName, identifierValue);
    });
    var event = nga.entity('events').url(function(entityName, viewType, identifierValue, identifierName) {
        return urlRewite(entityName, identifierValue);
    });
    var eventSearchResult = nga.entity('event_search_results').url(function(entityName, viewType, identifierValue, identifierName) {
        return urlRewite('search/events', identifierValue);
    });
    var eventSubscription = nga.entity('event-subscriptions').url(function(entityName, viewType, identifierValue, identifierName) {
        return urlRewite(entityName, identifierValue);
    });
    var userAttendances = nga.entity('user-attendances').url(function(entityName, viewType, identifierValue, identifierName) {
        return urlRewite(entityName, identifierValue);
    });

    // customizations
    calendar.updateMethod(updateMethod);
    event.updateMethod(updateMethod);
    eventSearchResult.identifier(nga.field('object.id'));
    eventSubscription.updateMethod(updateMethod);
    // add entitities
    admin.addEntity(service);
    admin.addEntity(calendar);
    admin.addEntity(event);
    admin.addEntity(eventSearchResult);
    admin.addEntity(eventSubscription);
    admin.addEntity(userAttendances);

    /* 

        MENU

    */
    admin.menu(nga.menu()
        .addChild(nga.menu(event)
            .title('Tasks and Events')
            .icon('<span class="fa fa-clock-o fa-fw"></span>')
            .active(function () {return true;})
            .addChild(nga.menu()
                .title('Browse')
                .link('/events/list') // ?search=%7B%22from_time%22:%222015-11-30T23:00:00.000Z%22,%22to_time%22:%222015-12-24T23:00:00.000Z%22%7D&sortField=events_ListView.start&sortDir=DESC
            )
            .addChild(nga.menu()
                .title('Search')
                .icon('<span class="fa fa-search fa-fw"></span>')
                // Q needs to be provided, quick fix
                .link('event_search_results/list?search={"q":"'+DEFAULTSEARCHTERM+'"}') // ?search=%7B%22from_time%22:%222015-11-30T23:00:00.000Z%22,%22to_time%22:%222015-12-24T23:00:00.000Z%22%7D&sortField=events_ListView.start&sortDir=DESC
            )
        )
        .addChild(nga.menu(calendar)
            .icon('<span class="fa fa-calendar-o fa-fw"></span>')
        )
        // .addChild(nga.menu(service)
        //     .icon('<span class="fa fa-calendar-o fa-fw"></span>')
        // )
    );

    /*
        
        DASHBOARD

    */
    admin.dashboard(nga.dashboard()
        .addCollection(nga.collection(event)
            .name('events')
            .title('Upcoming Tasks')
            .perPage(10)
            .fields([
                C42EventAvatarField,
                nga.field('title')
                    .isDetailLink(true)
                    .template(`
                        <a href="/#/events/edit/{{ entry.values.id }}"><b>{{ entry.values.title }}</b></a>
                        <div><b>Due: {{ entry.values.due | date:'d MMM HH:mm' }}</b></div>
                    `),
                nga.field('calendar_ids', 'reference_many')
                    .label('Calendars')
                    .targetEntity(calendar)
                    .targetField(nga.field('name')),
                nga.field('', 'template')
                    .label('')
                    .template(`
                        <a ng-if="entry.values.source_url" class="btn btn-primary btn-xs" target="_blank" href="{{ entry.values.source_url }}">Timeblock Picker <i class="glyphicon glyphicon-link"></a>
                    `),
            ])
            .permanentFilters({
                'include_removed_events':false,
                'event_type': 'todo'
            })
            .sortField('due')
            .sortDir('ASC')
        )
    );
    /*

        SERVICE

    */

    service.showView()
        .title(`
            <img src="{{entry.values.icon}}" style="height:80px">
            <span style="color:{{entry.values.color}}">{{entry.values.name}}</span>
            `)
        .actions([])
        .fields([
            nga.field('name', 'wysiwyg'),
            nga.field('description', 'wysiwyg'),
            nga.field('email'),
            nga.field('language'),
            nga.field('', 'template')
                .label('')
                .template(`
                    <h3>User Interface Configuration</h3>
                `),
            nga.field('color')
                .template(`
                    <span style="color:{{entry.values.color}}">{{entry.values.color}}</span>
                `),
            nga.field('contact_text'),
            nga.field('timeslot_intro'),
            nga.field('visit_planning_ui_texts', 'json')
                .label('Timeslot picker')
        ]);

    /*

        CALENDARS VIEWS

    */
    calendar.listView().fields([
        nga.field('color')
            .label('')
            .template('<div style="background-color:{{entry.values.color}};height:16px;width:16px;"></div>'),
        nga.field('name')
            .isDetailLink(true),
        nga.field('service_id', 'reference')
            .label('Service')
            .targetEntity(service)
            .targetField(nga.field('name'), 'wysiwyg'),
        nga.field('', 'template')
                .label('')
                .template('<span class="pull-right"><ma-filtered-list-button entity-name="events" label="See related events" filter="{ calendar_id: entry.values.id }" size="sm"></ma-filtered-list-button></span>')
    ])
    .perPage(30)
    .infinitePagination(true)
    .filters([
        nga.field('id'),
        nga.field('service_id'),
    ]);

    calendar.creationView().fields([
        nga.field('name'),
        nga.field('color'),
        nga.field('category'),
        nga.field('service_id'),
        nga.field('description', 'wysiwyg'),
        nga.field('auto_attendance'),  // Why required?
    ]);
    calendar.editionView().fields(calendar.creationView().fields());


    /* 

        EVENT SUBSCRIPTIONS VIEWS

    */
    
    eventSubscription.showView().fields([
        nga.field('subscriber.first_name').label('First Name'),
        nga.field('subscriber.last_name').label('Last Name'),
        nga.field('subscriber.email').label('Email'),
        nga.field('subscriber.phone_number').label('Phone number'),
    ]);

    eventSubscription.creationView().fields([
        nga.field('')
            .label('')
            .template('<h4>REQUIRED: <small>Add an Email OR a Phone Number OR a User Id to invite</small></h4>'),
        nga.field('subscriber.email')
            .label('Email'),
        nga.field('subscriber.phone_number')
            .label('Phone number'),
        nga.field('subscriber.id')
            .label('User id'),
        nga.field('')
            .label('')
            .template('<h4>REQUIRED: <small>The event to invite to</small></h4>'),
        nga.field('event_id')
            .label('Event Id')
            .editable(false),
        // nga.field('event_id', 'reference')
        //     .label('Event')
        //     .validation({required:true})
        //     .targetEntity(event)
        //     .targetField(nga.field('title').map(truncate)),
            // # Add event search here
        nga.field('permission', 'choice')
            .defaultValue('invited_write')
            .choices([
                { label: 'Read Only', value: 'invited_read' },
                { label: 'Read & Write', value: 'invited_write' },
            ]),
        nga.field('')
            .label('')
            .template('<hr/><h4>OPTIONAL: <small>Add a first name and last name. If the user is known in C42 it will not be overwritten</small></h4>'),
        nga.field('subscriber.first_name')
            .label('First Name'),
        nga.field('subscriber.last_name')
            .label('Last Name'),
    ]);

    /*

        EVENT VIEWS

     */    
    event.listView().fields([
        C42EventAvatarField,
        nga.field('title').isDetailLink(true),
        nga.field('event_type', 'choice')
            .choices(eventTypeChoices),
        // nga.field('sync_token'),
        // nga.field('state'),
        nga.field('due', 'datetime'),
        nga.field('start', 'datetime'),
        nga.field('end', 'datetime'),
        nga.field('calendar_ids', 'reference_many')
            .label('Calendars')
            .targetEntity(calendar)
            .targetField(nga.field('name')),
        nga.field('', 'template')
                .label('')
                .template(`
                    <a ng-if="entry.values.source_url" class="btn btn-primary btn-xs" target="_blank" href="{{ entry.values.source_url }}">Timeblock Picker <i class="glyphicon glyphicon-link"></a>
                `),
        // nga.field('', 'template')
        //         .label('')
        //         .template('<span class="pull-right"><ma-filtered-list-button ng-if="entry.values.event_type == \'todo\'" entity-name="events" label="Time Blocks within 15KM" filter="{ event_type: \'time_block\', geo_circle: [entry.values[\'start_location.geo.latitude\'], entry.values[\'start_location.geo.longitude\'], \'15000\' ]}" size="sm"></ma-filtered-list-button></span>')
    ])
    .title('Browse Tasks and Events')
    .permanentFilters({'include_removed_events':false})
    .perPage(10)
    .filters([
        nga.field('calendar_id', 'reference')
                .targetEntity(calendar)
                .targetField(nga.field('name')),
        nga.field('service_id'),
        nga.field('geo_circle')
            .attributes({'placeholder': '52.009507,4.360515,1000'}),
        nga.field('event_type', 'choice')
            .pinned(true)
            .choices(eventTypeChoices),
        nga.field('from_time', 'datetime')
            .pinned(true)
            .cssClasses("pull-left")
            .label('From')
            .attributes({'placeholder': 'Filter by date'}),
        nga.field('to_time', 'datetime')
            .pinned(true)
            .cssClasses("pull-left")
            .label('To')
            .attributes({'placeholder': 'Filter by date'})
    ]);

    event.creationView()
        .title('Create new Task or Event')
        .fields([
            nga.field('title'),
            nga.field('calendar_ids', 'reference_many')
                .targetEntity(calendar)
                .label('Calendars')
                .targetField(nga.field('name')),
            nga.field('event_type', 'choice')
                .defaultValue('todo')
                .choices([
                    { label: 'task', value: 'todo' },
                    { label: 'Normal', value: 'normal' },
                ]),
            nga.field('description', 'wysiwyg'),
            nga.field('start', 'datetime'),
            nga.field('end', 'datetime'),
            nga.field('due', 'datetime'),
            nga.field('', 'template')
                .label('')
                .template(`
                    <a ng-if="entry.values.source_url" class="btn btn-primary" target="_blank" href="{{ entry.values.source_url }}">Timeblock Picker</a>
                `),
            nga.field('', 'template')
                .label('')
                .template(`
                    <h3>Location</h3>
                `),
            nga.field('start_location.id', 'reference')
                .label('')
                .targetEntity(location)
                .targetField(nga.field('text'))
                .remoteComplete(true, {
                    refreshDelay: 300,
                    // searchQuery: search =>  { return '[like]=%' + search + '%' }
                    searchQuery: function (search) {
                        return { search_pattern: search };
                    }
                }),
            nga.field('start_location.geo', 'template')
                // somehow let this directive except the start location
                .label('')
                .editable(false)
                .template(`
                    <geocode lat="entry.values[\'start_location.geo.latitude\']" lon="entry.values[\'start_location.geo.longitude\']"></geocode>
                    <div class="help-block">{{ entry.values[\'start_location.address\'] }}, {{ entry.values[\'start_location.postcode\'] }}, {{ entry.values[\'start_location.city\'] }}</div>
                    `),
            
            // nga.field('', 'template')
            //     .label('')
            //     .template(`
            //         <h6>{{ entry.values[\'state\'] }} - {{ entry.values[\'id\'] }}</h6>
            //     `),
        ]);
    // use the same fields for the editionView as for the creationView
    event.editionView()
        .title('{{ entry.values.title }}')
        .actions(['export', 'list', 'delete'])
        // Extend the fields of the creation view
        .fields(event.creationView().fields().concat([
            // NOTE: Event subscriptions Don't work for bearer token
            nga.field('', 'template')
                .label('')
                .template(`
                    <div class="pull-right" style="margin-top:10px;">
                        <ma-create-button ng-show="entry.values.id" label="Invite others" entity-name="event-subscriptions" default-values="{ event_id: entry.values.id }" size="xl"></ma-create-button>
                    </div>
                    <h3>Attendees</h3>
                `),
            nga.field('eventSubscriptions', 'referenced_list')
                .label('')
                .targetEntity(eventSubscription)
                .targetReferenceField('event_id')
                .sortField('sync_token')
                .sortDir('DESC')
                .listActions(['show'])
                .targetFields([
                    nga.field('subscriber.photo')
                    .label('')
                    .template('<img src="{{entry.values[\'subscriber.photo\']}}" width="50" style="margin-top:5px" />'),
                nga.field('subscriber.last_name', 'template') // use last_name for sorting
                    .label('Name')
                    .isDetailLink(true)
                    .template(`
                        <div><b>{{entry.values['subscriber.first_name']}} {{entry.values['subscriber.last_name']}}</b></div>
                        `),
                nga.field('is_invitation', 'boolean')
                    .label('Invited'),
                nga.field('rsvp_status')
                    .label('RSVP'),
                // nga.field('', 'template')
                //     .label('')
                //     .template('<span class="pull-right"><ma-filtered-list-button entity-name="user-attendances" label="Show availability" filter="{ user_id: entry.values[\'subscriber.id\'] }" size="xs"></ma-filtered-list-button></span>')
            ]),
            ]));


    /*

        EVENT SEARH VIEW

     */    

    eventSearchResult.listView()
        .title('Search Tasks and Events')
        .fields([
            nga.field('')
                .label('Title')
                .template('<div>{{entry.values["object.title"]}}</div> <ma-edit-button entry="entry" entity-name="events" size="xs"></ma-edit-button>'),
            nga.field('matches', 'embedded_list')
                .label('')
                .targetFields([
                    nga.field('key')
                        .label(''),
                    nga.field('values')
                        .label('matches')
                ]),
            nga.field('matched_related_objects', 'embedded_list')
                .label('Matched subscriptions')
                .targetFields([
                    nga.field('matches', 'embedded_list')
                        .label('')
                        .targetFields([
                            nga.field('key')
                                .label(''),
                            nga.field('values')
                                .label('matches')
                        ]),
                ]),
        ])        
        .filters([
            nga.field('q')
            .pinned(true)
            .defaultValue('')
            .label('')
            .template('<div class="input-group"><input type="text" ng-model="value" placeholder="Search" class="form-control"></input><span class="input-group-addon"><i class="glyphicon glyphicon-search"></i></span></div>')
        ])
        .perPage(10);


    var two_weeks = new Date();
    two_weeks = two_weeks.setDate(two_weeks.getDate()+7);
    two_weeks = new Date(two_weeks);

    userAttendances.listView()
        .fields([
            nga.field('user_id')
        ])
        .permanentFilters({
                'from_time':new Date(),
                'to_time': two_weeks,
                'user_id': USERID
            })
        .filters([
            nga.field('from_time', 'datetime')
                .pinned(true)
                .cssClasses("pull-left")
                .label('From')
                .attributes({'placeholder': 'Filter by date'}),
            nga.field('to_time', 'datetime')
                .pinned(true)
                .cssClasses("pull-left")
                .label('To')
                .attributes({'placeholder': 'Filter by date'})
        ])
        ;

    // attach the admin application to the DOM and execute it
    nga.configure(admin);

}]);
