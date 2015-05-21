
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
    stateful: true,
    stateId: 'artifactGrowthAppState', //this.getContext().getScopedStateId('appState'),
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
    },{
        displayName: 'Day',
        value: 'day',
        dateFormat: 'Y-m-d',
        tickInterval: 30
    }],
    defaultDateSubtractor: -3,
    workspaces: null,
    selectedWorkspaces: null,
    selectedWorkspaceOids: [],
    launch: function() {

        Rally.technicalservices.Toolbox.fetchWorkspaces().then({
            scope: this,
            success: function(workspaces){
                this.logger.log('fetchWorkspaces Success', workspaces.length);
                this.workspaces = workspaces;
                this._initialize(workspaces, this._getSelectedWorkspaceObjects());
            }, 
            failure: function(msg){
                Rally.ui.notify.Notifier.showError({message: msg});
            }
        });
    },
    _getCurrentWorkspaceRecord: function(){
        var currentWorkspaceOid = this.getContext().getWorkspace().ObjectID;
        var record = this.workspaces[0];
        Ext.each(this.workspaces, function(workspace){
            if (workspace.get('ObjectID') == currentWorkspaceOid){
                record = workspace;
                return false;
            }
        });
        return record;
    },
    _getSelectedWorkspaceObjects: function(){
        var selectedWorkspaces = [];
        var currentWorkspace = null;
        if (this.selectedWorkspaceOids.length > 0){
            Ext.each(this.workspaces, function(wksp){
                if (Ext.Array.contains(this.selectedWorkspaceOids,wksp.get('ObjectID'))){
                    selectedWorkspaces.push(wksp);
                }
                if (wksp.get('ObjectID') == this.getContext().getWorkspace().ObjectID){
                    currentWorkspace = wksp;
                }
            }, this);
        }
        this.logger.log('_getSelectedWorkspaceObjects',this.selectedWorkspaceOids, selectedWorkspaces);
        if (selectedWorkspaces.length > 0) {
            return selectedWorkspaces;
        }
        currentWorkspace = currentWorkspace || this._getCurrentWorkspaceRecord();
        return [currentWorkspace];
    },
    _refreshArtifactChoicesAndRun: function(){
        var cb = this.down('#cb-artifact');
        if (cb){
            this._getArtifactFilters(this.selectedWorkspaces.length).then({
                scope: this,
                success: function(filters){
                    cb.getStore().clearFilter(true);
                    cb.getStore().filter(filters);
                    cb.getStore().on('load', this._run, this, {single: true});
                }
            });
        }
    },
    _fetchPortfolioItemTypes: function(){
        var deferred = Ext.create('Deft.Deferred');

        Ext.create('Rally.data.wsapi.Store',{
            model: 'TypeDefinition',
            fetch: ['TypePath','Ordinal'],
            autoLoad: true,
            filters: [{
                property: 'TypePath',
                operator: 'contains',
                value: 'PortfolioItem/'
            }],
            listeners: {
                scope: this,
                load: function(store, data, success){
                    var pi_types = new Array(data.length);
                    Ext.each(data, function(d){
                        //Use ordinal to make sure the lowest level portfolio item type is the first in the array.
                        var idx = Number(d.get('Ordinal'));
                        pi_types[idx] = d.get('TypePath');
                    }, this);
                    deferred.resolve(pi_types);
                }
            }
        });
        return deferred.promise;
    },
    _addSelectors: function(typeFilters, run){
        this.logger.log('_addSelectors',typeFilters.toString());

        this.down('#selector_box').removeAll();

        this.down('#selector_box').add({
            xtype: 'rallycombobox',
            fieldLabel: 'Artifact Type',
            labelAlign: 'right',
            itemId: 'cb-artifact',
            storeConfig: {
                autoLoad: true,
                model: 'TypeDefinition',
                filters: typeFilters,
                remoteFilter: true
            },
            margin: 10,
            valueField: 'TypePath',
            displayField: 'DisplayName',
            stateful: true,
            stateId: this.getContext().getScopedStateId('artifactType'),
            stateEvents: ['change']
        });

        this.down('#selector_box').add({
            xtype: 'rallydatefield',
            labelAlign: 'right',
            fieldLabel: 'Start Date',
            itemId: 'dt-start',
            margin: 10,
            labelWidth: 75,
            value: Rally.util.DateTime.add(new Date(),"month",this.defaultDateSubtractor)
        });

        this.down('#selector_box').add({
            xtype: 'rallydatefield',
            labelAlign: 'right',
            fieldLabel: 'End Date',
            itemId: 'dt-end',
            margin: 10,
            labelWidth: 75,
            value: new Date()
            //stateful: true,
            //stateId: 'dt-end',
            //stateEvents: ['change']
        });

        this.down('#selector_box').add({
            xtype: 'rallybutton',
            text: 'Workspaces...',
            scope: this,
            margin: 10,
            handler: this._selectWorkspaces
        });
        this.down('#selector_box').add({
            xtype: 'rallybutton',
            text: 'Run',
            scope: this,
            margin: 10,
            handler: this._run
        });
        this.down('#selector_box').add({
            xtype: 'rallybutton',
            itemId: 'btn-export',
            text: 'Export',
            scope: this,
            margin: 10,
            handler: this._export,
            disabled: true
        });
    },
    _getArtifactFilters: function(numWorkspaces){
        var deferred = Ext.create('Deft.Deferred');

        var types = ['Defect','HierarchicalRequirement','Task','PortfolioItem'];
        var filters = [];
        Ext.each(types, function(t){
            filters.push({
                property: 'TypePath',
                value: t
            });
        });

        if (numWorkspaces == 1){
            //Get the PI types and add those to the list
            this._fetchPortfolioItemTypes().then({
                scope: this,
                success: function(types){
                    this.logger.log('fetchPortfolioItemTypes',types);
                    Ext.each(types, function(t){
                        filters.push({
                            property: 'TypePath',
                            value: t
                        });
                    });
                    this.logger.log('filters',filters);
                    filters = Rally.data.wsapi.Filter.or(filters);
                    deferred.resolve(filters);
                }
            });
        } else {
            filters = Rally.data.wsapi.Filter.or(filters);
            deferred.resolve(filters);
        }
        return deferred;
    },
    _initialize: function(workspaces, selectedWorkspaces, runWhenDone){
        this.selectedWorkspaces = selectedWorkspaces;
        this._getArtifactFilters(selectedWorkspaces.length).then({
            scope: this,
            success: function(filters){
                this._addSelectors(filters, runWhenDone);
            }
        });
    },
    _selectWorkspaces: function(){
        this.logger.log('_selectWorkspaces', this.workspaces);
        Ext.create('Rally.technicalservices.dialog.PickerDialog',{
            records: this.workspaces,
            selectedRecords: this.selectedWorkspaces,
            displayField: 'Name',
            listeners: {
                scope: this,
                itemselected: this._workspacesSelected
            }
        });
    },
    /**
     * Gets the current state of the object. By default this function returns null,
     * it should be overridden in subclasses to implement methods for getting the state.
     * @return {Object} The current state
     */
    getState: function(){
        this.logger.log('getState');
        var workspaceOids = _.map(this.selectedWorkspaces, function(w){
            return w.ObjectID || w.get('ObjectID');
        });
        return{
            selectedWorkspaceOids: workspaceOids
        };
    },

    /**
     * Applies the state to the object. This should be overridden in subclasses to do
     * more complex state operations. By default it applies the state properties onto
     * the current object.
     * @param {Object} state The state
     */
    applyState: function(state){
        if (state && state.selectedWorkspaceOids && state.selectedWorkspaceOids.length > 0) {
            this.selectedWorkspaceOids = state.selectedWorkspaceOids;
            //Ext.apply(this, state);
        }
        this.logger.log('applyState', state, this.selectedWorkspaceOids);
    },

    _workspacesSelected: function(records){
        this.logger.log('_workspacesSelected', records); 
        var needChoiceUpdate = (records.length <= 1 || this.selectedWorkspaces.length == 1);
        if (records.length > 0){
            this.selectedWorkspaces = records;
        } else {
            this.selectedWorkspaces = [this.getContext().getWorkspace()];
        }
        //Save selected workspaces
        this.saveState();
        if (needChoiceUpdate){
            this._refreshArtifactChoicesAndRun();
        } else {
            this._run();
        }
     },
    _run: function(){
        var workspaces = this.selectedWorkspaces || [this.getContext().getWorkspace()];
        
        var cb = this.down('#cb-artifact');
        var type = cb.getValue(); 
        this.logger.log('_run',workspaces, cb, type, cb.getRecord());
        if (type == null){
            cb.setValue('PortfolioItem');
            type = cb.getValue();
        }
        var displayType = cb.getRecord().get(cb.displayField);

        var granularity = "month";
        var dateFormat = "M yyyy";
        var start_date = this.down('#dt-start').getValue();
        var end_date = this.down('#dt-end').getValue();
        var dateBuckets= Rally.technicalservices.Toolbox.getDateBuckets(start_date, end_date, granularity);

        this.setLoading(true);
        this._fetchSeriesData(workspaces, type, dateBuckets, granularity,end_date).then({
            scope: this,
            success: function(results){
                this.logger.log('_fetchData success:', results);
                var seriesData = [];
                var errors = [];
                Ext.each(results, function(obj){
                    if (typeof obj == 'object'){
                        seriesData.push(obj);
                    } else {
                        errors.push(obj);
                    }
                });
                var categories = Rally.technicalservices.Toolbox.formatDateBuckets(dateBuckets, dateFormat);
                this.setLoading(false);
                this._drawChart(seriesData, categories, displayType);
                this._showErrors(errors);
                this.setExportData(seriesData, categories, errors);
            },
            failure: function(data){
                this.setLoading(false);
                this.logger.log('_run._fetchSeriesData failed', data);
            }
        });
    },
    _export: function(){
        var cb = this.down('#cb-artifact');
        var artifact_type = cb.getValue();
        var filename = Ext.String.format('{0}-growth-{1}.csv', artifact_type, Rally.util.DateTime.format(new Date(),'Y-m-d'));
        if (this.exportData){
            Rally.technicalservices.FileUtilities.saveCSVToFile(this.exportData, filename);
        }
    },
    setExportData: function(seriesData, categories, errors){
        var text = 'Workspace,';
        
        Ext.each(categories, function(c){
            text += c + ',';
        });
        text = text.replace(/,+$/,'\n');
        
        Ext.each(seriesData, function(s){
            text += s.name + ',';
            Ext.each(s.data, function(p){
                text += p + ',';
            });
            text = text.replace(/,+$/,'\n');
        });
        
        Ext.each(errors, function(e){
            text += e + '\n';
        });
        this.logger.log('setExportData', text);
        this.down('#btn-export').setDisabled(false);
        this.exportData = text;  
    },
    _showErrors: function(errorStrings){
        this.logger.log('_showErrors',errorStrings);
    },
    _drawChart: function(seriesData, categories, displayName){
        this.logger.log('_drawChart');
        
        var me = this;
        var chart = this.down('#rally-chart') 
        if (chart){
            this.down('#rally-chart').destroy(); 
        }

        var title_text = Ext.String.format('{0} growth',displayName);
        var tick_interval = 1;
        
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
                        }
                    }
                ],
                plotOptions: {
                    series: {
                        dataLabels: {
                            format: '{point.y:.1f}%'
                        },
                        marker: {
                            enabled: false
                        }
                    }
                }
            }
        });        
    },

   _fetchSeriesData: function(workspaces, type, dateBuckets, granularity, endDate){
       var deferred = Ext.create('Deft.Deferred');
       
       var promises = [];  
       this.logger.log('_fetchSeriesData');
       
       Ext.each(workspaces, function(wksp){ 
           promises.push(this._fetchWorkspaceData(wksp, type, dateBuckets, granularity, endDate));
       },this);
       
       Deft.Promise.all(promises).then({
           scope: this,   
           success: function(data) {
               this.logger.log('_fetchSeriesData returned success', data);
               deferred.resolve(data);
           }, 
           failure: function(data){
               deferred.resolve(data);
               this.logger.log('_fetchSeriesData return failure',data);
           }
       });
       
       return deferred;
   },
   _fetchWorkspaceData: function(wksp, type,  dateBuckets, granularity, endDate){
       var deferred = Ext.create('Deft.Deferred');
       var wkspName = wksp.Name || wksp.get('Name');
       this._fetchTypeBaselineCountWsapi(wksp, type, dateBuckets[0]).then({
           scope: this,
           success: function(obj){
              this.setLoading('Fetching data from ' + wkspName); 
              this._fetchCreationDatesLookback(wksp, type, obj.maxObjectID, obj.count, dateBuckets, granularity, endDate).then({
                  scope: this,
                  success: function(obj){
                      deferred.resolve(obj);
                  },
                  failure: function(msg){
                      deferred.resolve(msg);
                  }
              });  //get the baseline count
          }
       });
       return deferred;  
   },
   _fetchCreationDatesLookback: function(wksp, type, objectID, baselineCount, dateBuckets, granularity, endDate){
       this.logger.log('_fetchCreationDatesLookback',wksp, type, objectID, baselineCount, endDate);
       var deferred = Ext.create('Deft.Deferred');
       var wkspRef = wksp._ref || wksp.get('_ref');
       var wkspName = wksp.Name || wksp.get('Name');
       var start = Date.now();
       var atDate = Rally.util.DateTime.toIsoString(endDate);
       Ext.create('Rally.data.lookback.SnapshotStore',{
           autoLoad: true,
           context: {workspace: wkspRef},
           find: {
               "_TypeHierarchy": type,
               "ObjectID": {$gt: objectID},
               "__At": atDate //"current"
           },
           fetch: ["CreationDate"],
           limit: 'Infinity',
           listeners: {
               scope: this,
               load: function(store, records, success){
                   this.logger.log('_fetchCreationDatesLookback time(ms): ', Date.now() - start, records, success);
                   if (success && records){
                       var data = this._mungeDataForWorkspace(wksp, type, baselineCount, dateBuckets, granularity, records);
                       deferred.resolve(data);
                   } else {
                       this.logger.log('_fetchCreationDatesLookback failed', store, records, success);
                       var msg = wkspName + ', load dates failed for ' + type;
                       deferred.resolve(msg);
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
       var wkspName = wksp.Name || wksp.get('Name');
       this.logger.log('series data', wkspName,series_data);
       return {name: wkspName, data: series_data, stack: 1, type: 'area'};  
       
   },
   _fetchTypeBaselineCountWsapi: function(wksp, type, beforeDate){
       var deferred = Ext.create('Deft.Deferred');
       var wkspRef = wksp._ref || wksp.get('_ref');
       var wkspName = wksp.Name || wksp.get('Name');
       this.logger.log('_fetchTypeBaselineCountWsapi', type, beforeDate);
       var start = Date.now();
       
       Ext.create('Rally.data.wsapi.Store',{
           model: type,
           fetch: ['ObjectID'],
           context: {workspace: wkspRef, project: null},
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
                       deferred.reject('_fetchTypeBaselineCountWsapi load failed for ' + type + ' in workspace ' + wkspName);
                   }
               }
           }
       });
       return deferred;  
   }
});