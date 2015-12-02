var myApp = angular.module('myApp', ['ng-admin']);

/**
 * CONFIG
*/

// create an admin application
var TOKEN = '';
var URL = '';


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
        
        // C42 adds expects directly in the params and not inside an object in a `_filter` param
        if (params._filters) {
            // C42 have so called array filters, that expect multiple values in an array
            var arrayFilterKeys = ['event_id', 'id', 'service_id', 'calendar_id', 'geo_circle', 'event_type'];
            for (var key in params._filters) {
                if (params._filters.hasOwnProperty(key)) {
                    if (arrayFilterKeys.indexOf(key) > -1) {
                        params[key+'s'] = '[' + params._filters[key] + ']';
                    } else {
                        params[key] = params._filters[key];
                    }
                }
            }
        }
        delete params._filters;

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


/**
 * NG-ADMIN CUSTOMIZATIONS
*/

// C42 expects URL's to always have a leading slash
var urlRewite = function (entityName, identifierValue) {
    return '/' + entityName + '/' + (identifierValue?identifierValue:"");
};

// C42 expects updates to be done with the patch Method
var updateMethod = 'patch';



/*
 * The actual admin config
*/
myApp.config(['NgAdminConfigurationProvider', function (nga) {
    
    // create an admin application
    var admin = nga.application('C42 Admin')
      .baseApiUrl(URL);
    
    /* CALENDARS */
    var calendar = nga.entity('calendars').url(function(entityName, viewType, identifierValue, identifierName) {
        return urlRewite(entityName, identifierValue);
    });
    calendar.updateMethod(updateMethod);
    calendar.listView().fields([
        nga.field('color')
            .label('')
            .template('<div style="background-color:{{entry.values.color}};height:16px;width:16px;"></div>'),
        nga.field('name')
            .isDetailLink(true),
        nga.field('category'),
        nga.field('service_id')
            .isDetailLink(false),
        nga.field('created', 'datetime')
            .editable(false)
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
        nga.field('description', 'wysiwyg')
    ]);
    calendar.editionView().fields(calendar.creationView().fields());
    admin.addEntity(calendar);


    /* EVENT SUBSCRIPTIONS */
    var eventSubscription = nga.entity('event-subscriptions').url(function(entityName, viewType, identifierValue, identifierName) {
        return urlRewite(entityName, identifierValue);
    });
    eventSubscription.showView().fields([
        nga.field('subscriber.first_name').label('First Name'),
        nga.field('subscriber.last_name').label('Last Name'),
    ]);
    admin.addEntity(eventSubscription);


    /* EVENTS */
    var event = nga.entity('events').url(function(entityName, viewType, identifierValue, identifierName) {
        return urlRewite(entityName, identifierValue);
    });

    event.updateMethod(updateMethod);
    event.listView().fields([
        nga.field('title').isDetailLink(true),
        nga.field('rsvp_status'),
        nga.field('sync_token'),
        nga.field('state'),
        nga.field('due', 'datetime'),
        nga.field('start', 'datetime'),
        nga.field('end', 'datetime'),
        nga.field('calendar_ids', 'reference_many')
            .targetEntity(calendar)
            .targetField(nga.field('name'))
    ])
    .perPage(10)
    .filters([
        nga.field('calendar_id'),
        nga.field('service_id'),
        nga.field('geo_circle')
            .attributes({'placeholder': '(52.009507 4.360515 100)'}),
        nga.field('event_type', 'choice')
            .choices([
                { label: 'Normal', value: 'normal' },
                { label: 'task', value: 'todo' },
                { label: 'Arrive By Trip', value: 'arrive_by' },
                { label: 'Depart From Trip', value: 'depart_from' },
                { label: 'Route', value: 'route' }
            ])

    ]);

    event.creationView()
        .title('Create new Event')
        .fields([
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
            nga.field('calendar_ids', 'reference_many')
                .targetEntity(calendar)
                .targetField(nga.field('name')),
            nga.field('title'),
            nga.field('event_type'),
            nga.field('description', 'wysiwyg'),
            nga.field('start', 'datetime'),
            nga.field('end', 'datetime'),
            nga.field('start_location.address').label('Address'),
            nga.field('start_location.city').label('City'),
            nga.field('start_location.zipcode').label('Zipcode'),
        ]);
    // use the same fields for the editionView as for the creationView
    event.editionView()
        .title('Edit: {{ entry.values.title }}')
        .fields(event.creationView().fields());
    admin.addEntity(event);


    // attach the admin application to the DOM and execute it
    nga.configure(admin);
}]);
