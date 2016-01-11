(function($) {
    AJS.toInit(function() {
        collectTopMailCounterScript();

        /* Models */
        var UserData = Backbone.Model.extend({url: AJS.contextPath() + '/rest/mailrucalendar/1.0/calendar/userPreference'});
        var Calendar = Backbone.Model.extend();
        var CalendarDetail = Backbone.Model.extend({urlRoot: AJS.contextPath() + '/rest/mailrucalendar/1.0/calendar/'});

        /* Collections */
        Backbone.Collection.CalendarCollection = Backbone.Collection.extend({
            model: Calendar,
            url: AJS.contextPath() + '/rest/mailrucalendar/1.0/calendar/all',
            comparator: function(a, b) {
                var aCount = a.get('usersCount'),
                    bCount = b.get('usersCount'),
                    aName = a.get('name'),
                    bName = b.get('name');
                if (!aCount && !bCount || aCount == bCount)
                    if (aName < bName)
                        return -1;
                    else if (aName > bName)
                        return 1;
                    else
                        return 0;
                else if (aCount < bCount)
                    return 1;
                else
                    return -1;
            }
        });

        /* Templates */
        var calendarLinkTpl = _.template($('#calendar-link-template').html());
        var issueInfoTpl = _.template($('#issue-info-template').html());

        /* Instances */
        var userData = new UserData();
        var calendarCollection = new Backbone.Collection.CalendarCollection();
        /* Bind events */
        userData.on('change:calendarView', function(model) {
            var view = model.get('calendarView') || "month";
            $('#calendar-full-calendar').fullCalendar('changeView', view);
        });
        userData.on('change:hideWeekends', function(model) {
            mainView.onHideWeekendsHandler(model.get('hideWeekends'));
        });

        calendarCollection.on('add', function(calendar) {
            mainView.addCalendarToList(calendar);
            mainView.removeEventSource(calendar);
            if (calendar.get('visible') && !calendar.get('hasError'))
                mainView.addEventSource(calendar);
        });
        calendarCollection.on('remove', function(calendar) {
            mainView.removeCalendarFromList(calendar);
        });
        calendarCollection.on('change', function(calendar) {
            var $calendarBlock = $('#calendar-list-item-block-' + calendar.id);
            $calendarBlock.find('span.aui-nav-item-label').text(calendar.get('name'));
            $calendarBlock.data('color', calendar.get('color'));
            $calendarBlock.toggleClass('calendar-visible', calendar.get('visible'));

            mainView.removeEventSource(calendar);
            if ((calendar.get('isMy') || calendar.get('favorite')) && calendar.get('visible') && !calendar.get('hasError')) {
                mainView.addEventSource(calendar);
            } else {
                mainView.changeEventSourceCallback(calendar.id, false, calendar.get('error'));

                if (!calendar.get('isMy') && !calendar.get('favorite')) {
                    mainView.removeCalendarFromList(calendar);
                }
            }
        });
        calendarCollection.on('change:favorite', function(calendar) {
            if (calendar.get('favorite')) {
                mainView.addCalendarToList(calendar);
            } else if (!calendar.get('isMy'))
                mainView.removeCalendarFromList(calendar);
        });
        calendarCollection.on('request', function() {
            mainView.startLoadingCalendarsCallback();
        });
        calendarCollection.on('sync', function() {
            mainView.finishLoadingCalendarsCallback();
        });

        var MainView = Backbone.View.extend({
            el: 'body',
            loadingCounter: 0,
            events: {
                'click #calendar-create-feed': 'showCalendarFeedView',
                'click .calendar-name': 'toggleCalendarVisibility',
                'click .calendar-delete': 'deleteCalendar',
                'click .calendar-edit': 'editCalendar',
                'click .calendar-remove': 'removeFavoriteCalendar',
                'click #calendar-create': 'createCalendar',
                'click #calendar-import': 'importCalendar'
            },
            initialize: function() {
                this.$fullCalendar = $('#calendar-full-calendar');
            },
            eventSource: function(id) {
                return AJS.contextPath() + '/rest/mailrucalendar/1.0/calendar/events/' + id;
            },
            addEventSource: function(calendar) {
                this.startLoadingCalendarsCallback();
                this.$fullCalendar.fullCalendar('addEventSource', {
                    url: this.eventSource(calendar.id),
                    success: $.proxy(function() {
                        this.changeEventSourceCallback(calendar.id, true, calendar.get('error'));
                    }, this)
                });
            },
            removeEventSource: function(calendar) {
                this.$fullCalendar.fullCalendar('removeEventSource', this.eventSource(calendar.id));
                this.finishLoadingCalendarsCallback();
            },
            changeEventSourceCallback: function(calendarId, visible, error) {
                var $calendarBlock = this.$('#calendar-list-item-block-' + calendarId);
                var $calendarLink = $calendarBlock.find('a.calendar-name');
                $calendarLink.removeClass('not-active');

                var calendarColor = $calendarBlock.data('color');
                $calendarLink.find('.calendar-view-color-box').remove();

                if (error) {
                    if (!$calendarLink.hasClass('not-working')) {
                        $calendarLink.addClass('not-working');
                        $calendarLink.find('.calendar-view-color-box').remove();
                        $calendarLink.prepend('<span class="aui-icon aui-icon-small aui-iconfont-error" title="' + error + '"></span>')
                    }
                } else {
                    if ($calendarLink.hasClass('not-working'))
                        $calendarLink.removeClass('not-working').find('span.aui-iconfont-error').remove();

                    if (visible)
                        $calendarLink.prepend('<div class="calendar-view-color-box" style="background-color: ' + calendarColor + ';"></div>');
                    else
                        $calendarLink.prepend('<div class="calendar-view-color-box" style="border: 2px solid ' + calendarColor + ';"></div>');
                }
            },
            startLoadingCalendarsCallback: function() {
                this.loadingCounter++;
                AJS.dim();
                JIRA.Loading.showLoadingIndicator();
            },
            finishLoadingCalendarsCallback: function() {
                this.loadingCounter--;
                if (this.loadingCounter <= 0) {
                    $('.calendar-name').removeClass('not-active');
                    AJS.undim();
                    JIRA.Loading.hideLoadingIndicator();
                    this.loadingCounter = 0;
                }
            },
            addCalendarToList: function(calendar) {
                var type = calendar.get('isMy') ? 'my' : 'favorite';
                this.$('#mailrucalendar-empty-calendar-list').css('display', 'none');
                var listBlock = this.$('#calendar-' + type + '-calendar-list');
                listBlock.css('display', 'block');
                listBlock.append(calendarLinkTpl({calendar: calendar.toJSON()}));

                AJS.$("#calendar-buttons-dropdown-" + calendar.id).on({
                    "aui-dropdown2-show": mainView.calendarDropdownShow,
                    "aui-dropdown2-hide": mainView.calendarDropdownHide
                });
            },
            removeCalendarFromList: function(calendar) {
                var calendarBlock = this.$('#calendar-list-item-block-' + calendar.id);
                var blockContainer = calendarBlock.parent('.aui-navgroup-inner');
                calendarBlock.remove();
                this.removeEventSource(calendar);

                if (!blockContainer.find('.calendar-list-item-block').length)
                    blockContainer.css('display', 'none');

                var calendarListEmpty = !this.collection.find(function(calendar) {
                    return calendar.get('isMy') || calendar.get('favorite');
                });
                calendarListEmpty && $('#mailrucalendar-empty-calendar-list').css('display', 'block');
            },
            loadFullCalendar: function(view, hideWeekends) {
                this.updatePeriodButton(view);
                var viewRenderFirstTime = true;
                this.$fullCalendar.fullCalendar({
                    contentHeight: 'auto',
                    defaultView: view,
                    header: {
                        left: 'prev,next today',
                        center: 'title',
                        right: 'weekend zoom-out,zoom-in'
                    },
                    views: {
                        quarter: {
                            type: 'basic',
                            duration: {months: 3}
                        }
                    },
                    customButtons: {
                        weekend: {
                            text: hideWeekends ? AJS.I18n.getText('ru.mail.jira.plugins.calendar.showWeekends') : AJS.I18n.getText('ru.mail.jira.plugins.calendar.hideWeekends'),
                            click: $.proxy(this.toggleWeekendsVisibility, this)
                        },
                        'zoom-out': {
                            icon: 'zoom-out',
                            click: $.proxy(this.zoomOutTimeline, this)
                        },
                        'zoom-in': {
                            icon: 'zoom-in',
                            click: $.proxy(this.zoomInTimeline, this)
                        }
                    },
                    businessHours: {
                        start: '10:00',
                        end: '19:00'
                    },
                    timeFormat: $("meta[name='ajs-date-time']").attr('content'),
                    slotLabelFormat: $("meta[name='ajs-date-time']").attr('content'),
                    lazyFetching: true,
                    editable: true,
                    draggable: true,
                    firstDay: 1,
                    allDayText: AJS.I18n.getText('ru.mail.jira.plugins.calendar.allDay'),
                    monthNames: [AJS.I18n.getText('ru.mail.jira.plugins.calendar.January'), AJS.I18n.getText('ru.mail.jira.plugins.calendar.February'), AJS.I18n.getText('ru.mail.jira.plugins.calendar.March'), AJS.I18n.getText('ru.mail.jira.plugins.calendar.April'), AJS.I18n.getText('ru.mail.jira.plugins.calendar.May'), AJS.I18n.getText('ru.mail.jira.plugins.calendar.June'), AJS.I18n.getText('ru.mail.jira.plugins.calendar.July'), AJS.I18n.getText('ru.mail.jira.plugins.calendar.August'), AJS.I18n.getText('ru.mail.jira.plugins.calendar.September'), AJS.I18n.getText('ru.mail.jira.plugins.calendar.October'), AJS.I18n.getText('ru.mail.jira.plugins.calendar.November'), AJS.I18n.getText('ru.mail.jira.plugins.calendar.December')],
                    monthNamesShort: [AJS.I18n.getText('ru.mail.jira.plugins.calendar.Jan'), AJS.I18n.getText('ru.mail.jira.plugins.calendar.Feb'), AJS.I18n.getText('ru.mail.jira.plugins.calendar.Mar'), AJS.I18n.getText('ru.mail.jira.plugins.calendar.Apr'), AJS.I18n.getText('ru.mail.jira.plugins.calendar.May'), AJS.I18n.getText('ru.mail.jira.plugins.calendar.Jun'), AJS.I18n.getText('ru.mail.jira.plugins.calendar.Jul'), AJS.I18n.getText('ru.mail.jira.plugins.calendar.Aug'), AJS.I18n.getText('ru.mail.jira.plugins.calendar.Sep'), AJS.I18n.getText('ru.mail.jira.plugins.calendar.Oct'), AJS.I18n.getText('ru.mail.jira.plugins.calendar.Nov'), AJS.I18n.getText('ru.mail.jira.plugins.calendar.Dec')],
                    dayNames: [AJS.I18n.getText('ru.mail.jira.plugins.calendar.Sunday'), AJS.I18n.getText('ru.mail.jira.plugins.calendar.Monday'), AJS.I18n.getText('ru.mail.jira.plugins.calendar.Tuesday'), AJS.I18n.getText('ru.mail.jira.plugins.calendar.Wednesday'), AJS.I18n.getText('ru.mail.jira.plugins.calendar.Thursday'), AJS.I18n.getText('ru.mail.jira.plugins.calendar.Friday'), AJS.I18n.getText('ru.mail.jira.plugins.calendar.Saturday')],
                    dayNamesShort: [AJS.I18n.getText('ru.mail.jira.plugins.calendar.Sun'), AJS.I18n.getText('ru.mail.jira.plugins.calendar.Mon'), AJS.I18n.getText('ru.mail.jira.plugins.calendar.Tue'), AJS.I18n.getText('ru.mail.jira.plugins.calendar.Wed'), AJS.I18n.getText('ru.mail.jira.plugins.calendar.Thu'), AJS.I18n.getText('ru.mail.jira.plugins.calendar.Fri'), AJS.I18n.getText('ru.mail.jira.plugins.calendar.Sat')],
                    buttonText: {
                        today: AJS.I18n.getText('ru.mail.jira.plugins.calendar.today')
                    },
                    weekends: !hideWeekends,
                    weekMode: 'liquid',
                    slotWidth: 100,
                    slotDuration: '01:00',
                    eventRender: function(event, $element) {
                        $element.addClass('calendar-event-object');
                        AJS.InlineDialog($element, "eventDialog", function(content, trigger, showPopup) {
                            $.ajax({
                                type: 'GET',
                                url: AJS.contextPath() + '/rest/mailrucalendar/1.0/calendar/events/' + event.calendarId + '/event/' + event.id + '/info',
                                success: function(issue) {
                                    content.html(issueInfoTpl({issue: issue})).addClass('calendar-event-info-popup');
                                    showPopup();
                                },
                                error: function(xhr) {
                                    var msg = "Error while trying to view info about issue => " + event.id;
                                    if (xhr.responseText)
                                        msg += xhr.responseText;
                                    alert(msg);
                                }
                            });
                            return false;
                        }, {
                            hideDelay: null,
                            onTop: true,
                            closeOnTriggerClick: true,
                            userLiveEvents: true
                        });
                    },
                    viewRender: function(view) {
                        mainView.updatePeriodButton(view.name);
                        mainView.updateButtonsVisibility(view);
                        if (viewRenderFirstTime)
                            viewRenderFirstTime = false;
                        else {
                            var $visibleCalendars = $('.calendar-visible');
                            mainView.startLoadingCalendarsCallback();
                            $visibleCalendars.find('a.calendar-name').addClass('not-active');
                        }
                    },
                    eventAfterAllRender: function() {
                        mainView.finishLoadingCalendarsCallback();
                    },
                    eventDrop: function(event, duration) {
                        eventMove(event, duration, true);
                    },
                    eventResize: function(event, duration) {
                        eventMove(event, duration, false);
                    }
                });

                function eventMove(event, duration, isDrag) {
                    $.ajax({
                        type: 'PUT',
                        url: AJS.contextPath() + '/rest/mailrucalendar/1.0/calendar/events/' + event.calendarId + '/event/' + event.id + '?dayDelta=' + duration._days + '&millisDelta=' + duration._milliseconds + '&isDrag=' + isDrag,
                        error: function(xhr) {
                            var msg = "Error while trying to drag event. Issue key => " + event.id;
                            if (xhr.responseText)
                                msg += xhr.responseText;
                            alert(msg);
                        }
                    });
                }
            },
            showCalendarFeedView: function(e) {
                e.preventDefault();
                new Backbone.View.CalendarFeedView({model: userData, collection: this.collection}).show();
            },
            createCalendar: function(e) {
                e.preventDefault();
                this.$('.aui-page-panel-nav').click();

                var calendarDialogView = new Backbone.View.CalendarDialogView({
                    model: new CalendarDetail(),
                    collection: this.collection
                });
                calendarDialogView.show();
            },
            importCalendar: function(e) {
                e.preventDefault();
                this.$('.aui-page-panel-nav').click();

                var importView = new Backbone.View.CalendarImportView({collection: calendarCollection});
                importView.show();
            },
            editCalendar: function(e) {
                e.preventDefault();
                e.stopPropagation();
                this.$('.aui-page-panel-nav').click();

                var calendarId = $(e.currentTarget).closest('div.aui-dropdown2').data('id');
                var calendarDetail = new CalendarDetail({id: calendarId});
                calendarDetail.fetch({
                    success: $.proxy(function(model) {
                        var calendarDialogView = new Backbone.View.CalendarDialogView({
                            model: model,
                            collection: this.collection
                        });
                        calendarDialogView.show();
                    }, this),
                    error: function(request) {
                        alert(request.responseText);
                    }
                });
            },
            toggleWeekendsVisibility: function(e) {
                e.preventDefault();
                e.currentTarget.blur();
                this.startLoadingCalendarsCallback();
                $.ajax({
                    type: 'PUT',
                    url: AJS.contextPath() + '/rest/mailrucalendar/1.0/calendar/userPreference/hideWeekends',
                    success: function() {
                        userData.set('hideWeekends', !userData.get('hideWeekends'));
                        mainView.finishLoadingCalendarsCallback();
                    },
                    error: function(xhr) {
                        mainView.finishLoadingCalendarsCallback();
                        var msg = "Error while trying to update user hide weekends option. ";
                        if (xhr.responseText)
                            msg += xhr.responseText;
                        alert(msg);
                    }
                });
            },
            onHideWeekendsHandler: function(hideWeekends) {
                this.getCalendarHeaderButton('weekend').text(hideWeekends ? AJS.I18n.getText('ru.mail.jira.plugins.calendar.showWeekends') : AJS.I18n.getText('ru.mail.jira.plugins.calendar.hideWeekends'));
                this.$fullCalendar.fullCalendar('option', 'weekends', !hideWeekends);
            },
            toggleCalendarVisibility: function(e) {
                e.preventDefault();
                var $calendarNameLink = this.$(e.currentTarget);
                if ($calendarNameLink.hasClass('not-working'))
                    return;

                var calendarId = $calendarNameLink.closest('div.calendar-list-item-block').data('id');

                this.startLoadingCalendarsCallback();
                $calendarNameLink.addClass('not-active');

                $.ajax({
                    type: 'PUT',
                    url: AJS.contextPath() + '/rest/mailrucalendar/1.0/calendar/' + calendarId + '/visibility',
                    success: function() {
                        var calendar = calendarCollection.get(calendarId);
                        calendar.set('visible', !calendar.get('visible'));
                    },
                    error: function(request) {
                        alert(request.responseText);
                    }
                });
            },
            setCalendarView: function(viewName) {
                this.$fullCalendar.fullCalendar('changeView', viewName);
                $.ajax({
                    type: 'PUT',
                    url: AJS.contextPath() + '/rest/mailrucalendar/1.0/calendar/userPreference/view?value=' + viewName,
                    error: function(xhr) {
                        var msg = "Error while trying to update user default view to => " + viewName;
                        if (xhr.responseText)
                            msg += xhr.responseText;
                        alert(msg);
                    }
                });
            },
            updatePeriodButton: function(viewName) {
                var $periodItem = this.$('#calendar-period-dropdown a[href$="' + viewName + '"]');

                this.$('#calendar-period-dropdown a').removeClass('aui-dropdown2-checked');
                this.$('#calendar-period-dropdown a').removeClass('checked');
                $periodItem.addClass('aui-dropdown2-checked');
                this.$('#calendar-period-btn .trigger-label').text($periodItem.text());
            },
            zoomOutTimeline: function() {
                var view = this.$fullCalendar.fullCalendar('getView');
                var canZoomOut = view.zoomOut();
                this.getCalendarHeaderButton('zoom-out').blur();
                !canZoomOut && view.calendar.header.disableButton('zoom-out');
                view.calendar.header.enableButton('zoom-in');
            },
            zoomInTimeline: function() {
                var view = this.$fullCalendar.fullCalendar('getView');
                var canZoomIn = view.zoomIn();
                this.getCalendarHeaderButton('zoom-in').blur();
                !canZoomIn && view.calendar.header.disableButton('zoom-in');
                view.calendar.header.enableButton('zoom-out');
            },
            getCalendarHeaderButton: function(buttonName) {
                return this.$fullCalendar.find('.fc-' + buttonName + '-button');
            },
            updateButtonsVisibility: function(view) {
                if (view.name === 'timeline') {
                    this.getCalendarHeaderButton('zoom-out').parent('.fc-button-group').show();
                } else {
                    this.getCalendarHeaderButton('zoom-out').parent('.fc-button-group').hide();
                }
                if (view.name === 'quarter' || view.name === 'month' || view.name === 'basicWeek')
                    this.getCalendarHeaderButton('weekend').show();
                else {
                    this.getCalendarHeaderButton('weekend').hide();
                }
            },
            removeFavoriteCalendar: function(e) {
                e.preventDefault();
                e.stopPropagation();
                this.$('.aui-page-panel-nav').click();

                var calendar = this.collection.get($(e.currentTarget).closest('div.aui-dropdown2').data('id'));
                $.ajax({
                    url: AJS.contextPath() + '/rest/mailrucalendar/1.0/calendar/userPreference/favorite/' + calendar.id,
                    type: "DELETE",
                    error: $.proxy(function(xhr) {
                        this.finishLoadingCalendarsCallback();
                        alert(xhr.responseText || "Internal error");
                    }, this),
                    success: function() {
                        calendar.set({favorite: false, visible: false, usersCount: calendar.get('usersCount') - 1});
                    }
                });
            },
            deleteCalendar: function(e) {
                e.preventDefault();
                e.stopPropagation();
                this.$('.aui-page-panel-nav').click();

                var calendar = this.collection.get($(e.currentTarget).closest('div.aui-dropdown2').data('id'));
                var confirmText = '<p>' + AJS.I18n.getText("ru.mail.jira.plugins.calendar.confirmDelete1").replace('%s', '<b>' + calendar.get('name') + '</b>') + '</p>';
                if (calendar.get('usersCount') > 1)
                    confirmText += '<p>' + AJS.I18n.getText("ru.mail.jira.plugins.calendar.confirmDelete2").replace('%s', calendar.get('usersCount')) + '</p>';
                var confirmDialog = new Backbone.View.ConfirmDialog({
                    okText: AJS.I18n.getText("common.words.delete"),
                    header: AJS.I18n.getText("ru.mail.jira.plugins.calendar.confirmDeleteHeader"),
                    text: confirmText,
                    okHandler: $.proxy(function() {
                        this.startLoadingCalendarsCallback();
                        $.ajax({
                            url: AJS.contextPath() + '/rest/mailrucalendar/1.0/calendar/' + calendar.id,
                            type: "DELETE",
                            error: $.proxy(function(xhr) {
                                this.finishLoadingCalendarsCallback();
                                alert(xhr.responseText || "Internal error");
                            }, this),
                            success: function() {
                                calendarCollection.remove(calendar);
                            }
                        });
                    }, this)
                });

                confirmDialog.show();
            },
            calendarDropdownShow: function() {
                var calendarId = $(this).data('id');
                $('div.calendar-list-item-block[data-id=' + calendarId + ']').toggleClass('calendar-list-item-selected', true);
            },
            calendarDropdownHide: function() {
                var calendarId = $(this).data('id');
                $('div.calendar-list-item-block[data-id=' + calendarId + ']').toggleClass('calendar-list-item-selected', false);
            }
        });

        /* Router */
        var ViewRouter = Backbone.Router.extend({
            routes: {
                '': 'defaultHandler',
                'period/:view': 'switchPeriod'
            },
            availableOptions: {
                view: {
                    quarter: true,
                    month: true,
                    basicWeek: true,
                    agendaDay: true,
                    timeline: true
                }
            },
            defaultHandler: function() {
                this.navigate('period/' + mainView.$fullCalendar.fullCalendar('getView').type);
            },
            switchPeriod: function(view) {
                view = this.validateViewType(view);
                this.navigate('period/' + view);
                mainView.setCalendarView(view);
            },
            validateViewType: function(view) {
                return this.availableOptions.view[view] ? view : 'month';
            }
        });

        var mainView = new MainView({collection: calendarCollection});
        var router = new ViewRouter();

        /* Fetch data */
        userData.fetch({
            success: function(model) {
                var view = model.get('calendarView') || "month";
                mainView.loadFullCalendar(view, model.get('hideWeekends'));

                Backbone.history.start();
            },
            error: function(model, response) {
                var msg = "Error while trying to load user preferences.";
                if (response.responseText)
                    msg += response.responseText;
                alert(msg);
                mainView.loadFullCalendar("month", false);

                Backbone.history.start();
            }
        });
        calendarCollection.fetch({
            silent: true,
            success: function(collection) {
                var htmlFavoriteCalendars = '';
                var htmlMyCalendars = '';
                var eventSources = [];

                if (!!collection.findWhere({visible: true}))
                    mainView.startLoadingCalendarsCallback();

                collection.each(function(calendar) {
                    var json = calendar.toJSON();
                    if (calendar.get('isMy'))
                        htmlMyCalendars += calendarLinkTpl({calendar: json});
                    else if (calendar.get('visible') || calendar.get('favorite'))
                        htmlFavoriteCalendars += calendarLinkTpl({calendar: json});
                    if (calendar.get('visible') && !calendar.get('hasError'))
                        eventSources.push(AJS.contextPath() + '/rest/mailrucalendar/1.0/calendar/events/' + calendar.id);
                });

                if (htmlMyCalendars) {
                    $('#calendar-my-calendar-list').css('display', 'block');
                    $('#calendar-my-calendar-list').append(htmlMyCalendars);
                }

                if (htmlFavoriteCalendars) {
                    $('#calendar-favorite-calendar-list').css('display', 'block');
                    $('#calendar-favorite-calendar-list').append(htmlFavoriteCalendars);
                }

                if (!htmlFavoriteCalendars && !htmlMyCalendars)
                    $('#mailrucalendar-empty-calendar-list').css('display', 'block');

                collection.each(function(calendar) {
                    if (calendar.get('isMy') || calendar.get('visible') || calendar.get('favorite'))
                        AJS.$("#calendar-buttons-dropdown-" + calendar.id).on({
                            "aui-dropdown2-show": mainView.calendarDropdownShow,
                            "aui-dropdown2-hide": mainView.calendarDropdownHide
                        });
                });

                for (var a = 0; a < eventSources.length; a++)
                    $('#calendar-full-calendar').fullCalendar('addEventSource', eventSources[a]);
            },
            error: function(request) {
                alert(request.responseText);
            }
        });
    });
})(AJS.$);

/**
 * Run statistic counter - like Google Analytics.
 * Surely, it doesn't collect any personal data or private information.
 * All information you can check on top.mail.ru.
 */
function collectTopMailCounterScript() {
    var _tmr = window._tmr || (window._tmr = []);
    _tmr.push({id: "2706504", type: "pageView", start: (new Date()).getTime()});
    (function(d, w, id) {
        if (d.getElementById(id)) return;
        var ts = d.createElement("script");
        ts.type = "text/javascript";
        ts.async = true;
        ts.id = id;
        ts.src = (d.location.protocol == "https:" ? "https:" : "http:") + "//top-fwz1.mail.ru/js/code.js";
        var f = function() {
            var s = d.getElementsByTagName("script")[0];
            s.parentNode.insertBefore(ts, s);
        };
        if (w.opera == "[object Opera]") {
            d.addEventListener("DOMContentLoaded", f, false);
        } else {
            f();
        }
    })(document, window, "topmailru-code");
}