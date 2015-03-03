Ext.define('CustomApp', {
    extend: 'Rally.app.App',
    componentCls: 'app',
    logger: new Rally.technicalservices.Logger(),
    items: [
        {xtype:'container',itemId:'message_box',tpl:'Hello, <tpl>{_refObjectName}</tpl>'},
        {xtype:'container',itemId:'selector_box', layout: {type: 'hbox'}, padding: 5},
        {xtype:'container',itemId:'display_box'},
        {xtype:'tsinfolink'}
    ],
    granularityStore: [{
        displayName: 'Month',
        value: 'month',
        dateFormat: 'M yyyy',
        tickInterval: 1
    },{
        displayName: 'Week',
        value: 'week',
        dateFormat: 'M dd yyyy',
        tickInterval: 5
    }],

    workspaces: null,
    launch: function() {

        Rally.technicalservices.Toolbox.fetchWorkspaces().then({
            scope: this,
            success: function(workspaces){
                this.logger.log('fetchWorkspaces Success', workspaces.length);
                this._initialize(workspaces);
            }, 
            failure: function(msg){
                Rally.ui.notify.Notifier.showError({message: msg});
            }
        });
    },
    _initialize: function(workspaces){
        this.workspaces = workspaces; 
        
        var types = ['Defect','HierarchicalRequirement','Task','PortfolioItem'];
        var filter = Ext.create('Rally.data.wsapi.Filter', {
            property: 'Name',
            value: types[0] 
        });        
        for (var i=1; i< types.length; i++){
            filter = filter.or(Ext.create('Rally.data.wsapi.Filter', {
                property: 'TypePath',
                value: types[i]
            }));        
        }
        this.down('#selector_box').add({
            xtype: 'rallycombobox',
            fieldLabel: 'Artifact Type',
            labelAlign: 'right',
            itemId: 'cb-artifact',
            storeConfig: {
                autoLoad: true,
                model: 'TypeDefinition',
                filters: filter,
                 remoteFilter: true
            },
            valueField: 'TypePath',
            displayField: 'DisplayName',
        });
        
        this.down('#selector_box').add({
            xtype: 'rallybutton',
            text: 'Run',
            scope: this,
            handler: this._run
        });
        
    },
    _run: function(){
        var start_date = Rally.util.DateTime.add(new Date(),"month",-3); //cb.getValue());
        var workspaces = this.workspaces; //[this.getContext().getWorkspace()];
        var cb = this.down('#cb-artifact');
        var type = cb.getValue(); 
        var displayType = cb.getRecord().get(cb.displayField);
        var granularity = "day";
        var dateFormat = "Y-m-d";
        var end_date = new Date();
        
        var dateBuckets= Rally.technicalservices.Toolbox.getDateBuckets(start_date, end_date, granularity);
        this._fetchSeriesData(workspaces, type, dateBuckets, granularity).then({
            scope: this,
            success: function(seriesData){
                var categories = Rally.technicalservices.Toolbox.formatDateBuckets(dateBuckets, dateFormat);
                this.logger.log('_fetchData success:', seriesData);
                this._drawChart(seriesData, categories, displayType);
            },
            failure: function(data){
                this.logger.log('_run._fetchSeriesData failed', data);
            }
        });
    },
    _drawChart: function(seriesData, categories, displayName){
        this.logger.log('_drawChart');
        
        var me = this;
        var chart = this.down('#rally-chart') 
        if (chart){
            this.down('#rally-chart').destroy(); 
        }

        var title_text = Ext.String.format('{0} growth',displayName);
        var tick_interval = 5;  
        
        this.down('#display_box').add({
            xtype: 'rallychart',
            itemId: 'rally-chart',
            chartData: {
                series: seriesData,
                categories: categories
            }, 
            loadMask: false,
            chartConfig: {
                chart: {
                    zoomType: 'xy',
                    type: 'area'
                },
                title: {
                    text: title_text
                },
                xAxis: {
                    tickInterval: tick_interval,
                    title: {
                        text: 'Date'
                    }
                },
                yAxis: [
                    {
                        title: {
                            text: 'Number of Artifacts'
                        },
                    }
                ],
                plotOptions: {
                    series: {
                        dataLabels: {
                            format: '{point.y:.1f}%'
                        },
                        marker: {
                            enabled: false,
                        },
                    }
                }
            }
        });        
    },

   _fetchSeriesData: function(workspaces, type, dateBuckets, granularity){
       var deferred = Ext.create('Deft.Deferred');
       
       var promises = [];  
       var end_date = new Date();
       
       this.logger.log('_fetchSeriesData');
       
       Ext.each(workspaces, function(wksp){ 
           promises.push(this._fetchWorkspaceData(wksp, type, dateBuckets, granularity));
       },this);
       
       Deft.Promise.all(promises).then({
           scope: this,   
           success: function(data) {
               this.logger.log('_fetchSeriesData returned success', data);
               deferred.resolve(data);
           }, 
           failure: function(data){
               deferred.reject(data);
               this.logger.log('_fetchSeriesData return failure',data);
           }
       });
       
       return deferred;
   },
   _fetchWorkspaceData: function(wksp, type,  dateBuckets, granularity){
       var deferred = Ext.create('Deft.Deferred');
       this._fetchTypeBaselineCountWsapi(wksp, type, dateBuckets[0]).then({
           scope: this,
           success: function(obj){
              this._fetchCreationDatesLookback(wksp, type, obj.maxObjectID, obj.count, dateBuckets, granularity).then({
                  scope: this,
                  success: function(obj){
                      deferred.resolve(obj);
                  },
                  failure: function(msg){
                      deferred.reject(msg);
                  }
              });  //get the baseline count
          }
       });
       return deferred;  
   },
   _fetchCreationDatesLookback: function(wksp, type, objectID, baselineCount, dateBuckets, granularity){
       this.logger.log('_fetchCreationDatesLookback',wksp, type, objectID, baselineCount);
       var deferred = Ext.create('Deft.Deferred');
       
       var start = Date.now();
       Ext.create('Rally.data.lookback.SnapshotStore',{
           autoLoad: true,
           context: {workspace: wksp.get('_ref')},
           find: {
               "_TypeHierarchy": type,
               "ObjectID": {$gt: objectID},
               "__At": "current"
           },
           fetch: ["CreationDate"],
           listeners: {
               scope: this,
               load: function(store, records, success){
                   this.logger.log('_fetchCreationDatesLookback time(ms): ', Date.now() - start, records.length, success);
                   console.log(records);
                   if (success){
                       var data = this._mungeDataForWorkspace(wksp, type, baselineCount, dateBuckets, granularity, records);
                       deferred.resolve(data);
                   } else {
                       this.logger.log('_fetchCreationDatesLookback failed');
                       var msg = 'Load creation dates failed for ' + type + ' in ' + wksp.get('Name');
                       deferred.reject(msg);
                   }
               }
           }
       });
       return deferred; 
   },
   _mungeDataForWorkspace: function(wksp, type, baselineCount, dateBuckets, granularity, records){
       this.logger.log('_mungeDataForWorkspace');
       
       var dates = _.map(records, function(r){return Rally.util.DateTime.fromIsoString(r.get('CreationDate'))});
       
       var fn_sort_asc = function(d1, d2){
           if (d1 > d2){
               return 1;
           }
           if (d2 > d1){
               return -1; 
           }
           return 0;  
       };
       var sorted_dates = dates.sort(fn_sort_asc);
       
       var series_data = _.range(dateBuckets.length).map(function(){return 0});  
       var artifact_count = baselineCount;  
       for (var i=0; i < dateBuckets.length; i++){
           var range_end = Rally.util.DateTime.add(dateBuckets[i],granularity,1);
           Ext.each(sorted_dates, function(d){
               if (d > range_end){
                   return false;  
               }
               if (d >= dateBuckets[i]){
                   artifact_count++;
               }
           });
           series_data[i]=artifact_count;  
       }
       return {name: wksp.get('Name'), data: series_data, stack: 1, type: 'area'};  
       
   },
   _fetchTypeBaselineCountWsapi: function(wksp, type, beforeDate){
       var deferred = Ext.create('Deft.Deferred');

       this.logger.log('_fetchTypeBaselineCountWsapi', type, beforeDate);
       var start = Date.now();
       
       Ext.create('Rally.data.wsapi.Store',{
           model: type,
           fetch: ['ObjectID'],
           context: {workspace: wksp.get('_ref'), project: null},
           filters: {
               property: 'CreationDate',
               operator: '<',
               value: Rally.util.DateTime.toIsoString(beforeDate)
           },
           sorters: {
               property: 'ObjectID',
               direction: 'DESC'
           },
           autoLoad: true,
           pageSize: 1,
           limit: 1,
           listeners: {
               scope: this,
               load: function(store, records, success){
                   this.logger.log('_fetchTypeBaselineCountWsapi load  time(ms): ', Date.now() - start, ' count: ', store.getTotalCount(), ' success: ', success);
                   if (success){
                      var count = store.getTotalCount();
                      var object_id = 0;
                      if (count > 0){
                          object_id = records[0].get('ObjectID');
                      }
                      deferred.resolve({count: store.getTotalCount(), maxObjectID: object_id});
                   } else {
                       deferred.reject('_fetchTypeBaselineCountWsapi load failed for ' + type + ' in workspace ' + wksp.get('Name'));
                   }
               }
           }
       });
       return deferred;  
   }
});