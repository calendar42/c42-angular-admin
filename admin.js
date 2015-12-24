var myApp = angular.module('myApp', ['ng-admin']);

/**
 * CONFIG
*/

var URL = '';
var ACCOUNTSURL = ''; // Required for getEventIconUrl
var TOKEN = '';
var USERID = ''; // Required for getEventIconUrl
var SERVICEID = '';


/**
 * NG-ADMIN CUSTOMIZATIONS
*/

// C42 expects URL's to always have a leading slash
var urlRewite = function (entityName, identifierValue) {
    return '/' + entityName + '/' + (identifierValue?identifierValue:"");
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
            // C42 expects partial payloads in patch
            // C42 doesn't allow all fields to be null in patch, they should then not be send
            delete element.id;
            var nonNullFields = ['all_day','start', 'end','length','end_timezone','start_timezone','time_buffer','rsvp_status'];
            for (var i = nonNullFields.length - 1; i >= 0; i--) {
                if (element[nonNullFields[i]] === null) {
                    delete element[nonNullFields[i]];
                }
            }
        }
        // params.service_ids= '['+SERVICEID+']';
        
        /*
            C42 adds expects filers directly in the params and not inside an object in a `_filter` param
        */
        if (params._filters) {
            /*
                as search is on a different end point, this is not working yet
                addFullRequestInterceptor doesn't allow to write over the url
                https://github.com/mgonto/restangular/issues/1083
            */
            // if (params._filters.q) {
            //     console.warn(what, url);
            //     url = "https://beta.calendar42.com/app/django/api/v2/events/";
            //     return {url: url, params: { q: params._filters.q}};
            // }

            /*
                C42 uses array filters, that expect multiple values in an array
                The fields of ng-admin don't really support this out of the box, so in the view layer we
                pretend that they are singular filters (e.g. `id` instead of `ids`)
                This
            */
            var arrayFilterKeys = ['event_id', 'id', 'service_id', 'calendar_id', 'geo_circle', 'event_type'];
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
        } else if (operation == "get") {
            data = data.data[0];
        }
        return data;
    });
}]);




/*
 * The actual admin config
*/
myApp.config(['NgAdminConfigurationProvider', function (nga) {
    var admin = nga.application('C42 Admin').baseApiUrl(URL);

    /* 

        ENTITIES

    */
    var calendar = nga.entity('calendars').url(function(entityName, viewType, identifierValue, identifierName) {
        return urlRewite(entityName, identifierValue);
    });
    var event = nga.entity('events').url(function(entityName, viewType, identifierValue, identifierName) {
        return urlRewite(entityName, identifierValue);
    });
    var eventSubscription = nga.entity('event-subscriptions').url(function(entityName, viewType, identifierValue, identifierName) {
        return urlRewite(entityName, identifierValue);
    });
    admin.addEntity(calendar);
    admin.addEntity(event);
    admin.addEntity(eventSubscription);

    /* 

        MENU

    */
    admin.menu(nga.menu()
        .addChild(nga.menu(event)
            .icon('<span class="fa fa-clock-o fa-fw"></span>')
            // .addChild(nga.menu()
            //     .title('This week')
            //     .link('/events/list?search=%7B%22from_time%22:%222015-11-30T23:00:00.000Z%22,%22to_time%22:%222015-12-24T23:00:00.000Z%22%7D&sortField=events_ListView.start&sortDir=DESC')
            //     .icon('<span class="fa fa-user-times fa-fw"></span>')) // no active() function => will never appear active
        )
        .addChild(nga.menu(calendar)
            .icon('<span class="fa fa-calendar-o fa-fw"></span>'))
    );

    /*

        CALENDARS VIEWS

    */
    calendar.updateMethod(updateMethod);
    calendar.listView().fields([
        nga.field('color')
            .label('')
            .template('<div style="background-color:{{entry.values.color}};height:16px;width:16px;"></div>'),
        nga.field('name')
            .isDetailLink(true),
        nga.field('service_id', 'template')
            .label('Service Related')
            .template('<span ng-show="entry.values.service_id">Service related</span>')
            .isDetailLink(false),
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

    event.updateMethod(updateMethod);
    event.listView().fields([
        nga.field('_local_avatar', 'template')
                .label('')
                .map(function capitalize(value, entry) {
                    return getEventIconUrl(entry.id);
                })
                .template('<img class="img-rounded" src="{{ entry.values._local_avatar }}" width="24" height="24" style="margin-top:-2px" />'),
        nga.field('title').isDetailLink(true),
        nga.field('event_type'),
        nga.field('sync_token'),
        nga.field('state'),
        nga.field('created', 'datetime'),
        nga.field('due', 'datetime'),
        nga.field('start', 'datetime'),
        nga.field('end', 'datetime'),
        nga.field('calendar_ids', 'reference_many')
            .targetEntity(calendar)
            .targetField(nga.field('name')),
        nga.field('', 'template')
                .label('')
                .template('<span class="pull-right"><ma-filtered-list-button ng-if="entry.values.event_type == \'todo\'" entity-name="events" label="Time Blocks within 15KM" filter="{ event_type: \'time_block\', geo_circle: [entry.values[\'start_location.geo.latitude\'], entry.values[\'start_location.geo.longitude\'], \'15000\' ]}" size="sm"></ma-filtered-list-button></span>')
    ])
    .permanentFilters({'include_removed_events':false})
    .perPage(10)
    .filters([
        nga.field('calendar_id'),
        nga.field('service_id'),
        nga.field('geo_circle')
            .attributes({'placeholder': '52.009507,4.360515,1000'}),
        nga.field('event_type', 'choice')
            .pinned(true)
            .choices([
                { label: 'Normal', value: 'normal' },
                { label: 'task', value: 'todo' },
                { label: 'Time block', value: 'time_block' },
                { label: 'Arrive By Trip', value: 'arrive_by' },
                { label: 'Depart From Trip', value: 'depart_from' },
                { label: 'Route', value: 'route' }
            ]),
        /*
            After deployment of the new code, this can work
        */
        nga.field('from_time', 'datetime')
            .pinned(true)
            .cssClasses("pull-left")
            .label('From')
            .attributes({'placeholder': 'Filter by date'}),
        nga.field('to_time', 'datetime')
            .pinned(true)
            .cssClasses("pull-left")
            .label('To')
            .attributes({'placeholder': 'Filter by date'}),
        // nga.field('q')
        //     .pinned(true)
        //     .label('')
        //     .template('<div class="input-group"><input type="text" ng-model="value" placeholder="Search" class="form-control"></input><span class="input-group-addon"><i class="glyphicon glyphicon-search"></i></span></div>')
        //     .transform(function (v){return v && v.toUpperCase();}) // transform the entered value before sending it as a query parameter
        //     .map(function (v){return v && v.toLowerCase();}) // map the query parameter to a displayed value in the filter form
    ]);

    event.creationView()
        .title('Create new Event')
        .fields([
            // Doesn't work for bearer token
            nga.field('eventSubscriptions', 'referenced_list')
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
                    .template("{{entry.values['subscriber.first_name']}} {{entry.values['subscriber.last_name']}}"),
                nga.field('is_invitation', 'boolean')
                    .label('Invited'),
                nga.field('rsvp_status')
                    .label('RSVP')
            ]),
            nga.field('', 'template')
                .label('')
                .template('<ma-create-button ng-show="entry.values.id" label="Invite" entity-name="event-subscriptions" default-values="{ event_id: entry.values.id }" size="xs"></ma-create-button>'),
            nga.field('calendar_ids', 'reference_many')
                .targetEntity(calendar)
                .targetField(nga.field('name')),
            nga.field('title'),
            nga.field('state'),
            nga.field('event_type'),
            nga.field('description', 'wysiwyg'),
            nga.field('start', 'datetime'),
            nga.field('end', 'datetime'),
            nga.field('start_location.text').label('Text'),
            nga.field('start_location.address').label('Address'),
            nga.field('start_location.city').label('City'),
            nga.field('start_location.zipcode').label('Zipcode'),
        ]);
    // use the same fields for the editionView as for the creationView
    event.editionView()
        .title('Edit: {{ entry.values.title }}')
        .fields(event.creationView().fields());



    // attach the admin application to the DOM and execute it
    nga.configure(admin);

}]);
