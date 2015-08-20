Ext.define("TSUserGrowth", {
    extend: 'Rally.app.App',
    componentCls: 'app',
    logger: new Rally.technicalservices.Logger(),
    defaults: { margin: 10 },
    items: [
        {xtype:'container',itemId:'selector_box', layout: {type: 'hbox'}, padding: 5},
        {xtype:'container',itemId:'display_box'}
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
    },{
        displayName: 'Day',
        value: 'day',
        dateFormat: 'Y-m-d',
        tickInterval: 30
    }],
    defaultDateSubtractor: -3,
    
    launch: function() {
        var me = this;
        this._addSelectors();
    },
    
    _run: function() {
        var me = this;
        this.setLoading("Loading revision history...");

        var granularity = "month";
        var start_date = this.down('#dt-start').getValue();
        var end_date = this.down('#dt-end').getValue();
        var dateBuckets = Rally.technicalservices.Toolbox.getDateBuckets(start_date, end_date, granularity);
        
        this.logger.log("Date Buckets:", dateBuckets);
        
        this._getSubscriptionRevisions().then({
            scope: this,
            success: function(revs) {
                // added USER [user5@company.com]
                // removed USER [user6@company.com]
                
                var data_by_bucket = [];
                Ext.Array.each(dateBuckets, function(bucket,idx) {
                    data_by_bucket[idx] = 0;
                });
                
                Ext.Array.each(revs, function(rev){
                    var rev_date = rev.get('CreationDate');
                    var rev_description = rev.get('Description');
                    
                    var index = this._getIndexFromBucket(dateBuckets,rev_date);
                    
                    if ( data_by_bucket.length > index ) {
                        if ( /added USER /.test(rev_description) ) {
                            data_by_bucket[index] += 1;
                        }
                        if ( /removed USER /.test(rev_description) ) {
                            data_by_bucket[index] -= 1;
                        }
                    }
                },this);
                
                var cumulative_data = this._makeCumulativeData(data_by_bucket);
                
                var series = { data: cumulative_data, name: 'Users', type: 'area', stack: 1 };
                        
                var dateFormat = "M yyyy";
                var categories = Rally.technicalservices.Toolbox.formatDateBuckets(dateBuckets, dateFormat);
        
                this._drawChart(series, categories, "User Growth");
                this.setExportData(series, categories, []);
            },
            failure: function(msg) {
                Ext.Msg.alert(msg);
            }
        }).always(function() { me.setLoading(false); });
    },
    
    _getIndexFromBucket: function(buckets,rev_date){
        var index = -1;
        Ext.Array.each(buckets, function(bucket,idx){
            if ( rev_date >= bucket ) {
                index = idx;
            }
        });
        
        return index + 1;
    },
    
    _addSelectors: function(){
        this.logger.log('_addSelectors');

        this.down('#selector_box').removeAll();

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
    
    _getSubscriptionRevisions: function() {
        var deferred = Ext.create('Deft.Deferred');
        
        var model = "Subscription";
        var fields = ["ObjectID","Name","RevisionHistory"];
        
        this._loadRecordsWithAPromise(model,fields).then({
            scope: this,
            success: function(results) {
                var rev_history_oid = results[0].get('RevisionHistory').ObjectID;
                var filter = [
                    {property:'RevisionHistory.ObjectID', value:rev_history_oid},
                    {property:'Description', operator: 'contains', value: 'USER '}
                ];
                var context = { project: null };
                
                this._loadRecordsWithAPromise('Revision',['Description','CreationDate'],filter, context).then({
                    success: function(rev) {
                        deferred.resolve(rev);
                    },
                    failure: function(msg) {
                        deferred.reject(msg);
                    }
                });
                
            },
            failure: function(msg) {
                deferred.reject(msg);
            }
        });
        return deferred.promise;
    },
    
    _loadRecordsWithAPromise: function(model_name, model_fields, filters, context){
        var deferred = Ext.create('Deft.Deferred');
        var me = this;
        this.logger.log("Starting load:",model_name,model_fields);
        
        var store_config = {
            model: model_name,
            fetch: model_fields,
            filters: filters || [],
            limit: 'Infinity'
        };
        
        if ( context ) {
            store_config.context = context; 
        }
        
        Ext.create('Rally.data.wsapi.Store', store_config).load({
            callback : function(records, operation, successful) {
                if (successful){
                    deferred.resolve(records);
                } else {
                    me.logger.log("Failed: ", operation);
                    deferred.reject('Problem loading: ' + operation.error.errors.join('. '));
                }
            }
        });
        return deferred.promise;
    },
    
    _makeCumulativeData: function(data_array){
        var initial = 0;
        return Ext.Array.map(data_array,function(datum){
            var new_value = datum+initial;
            initial=new_value;
            return new_value;
        });
    },
    
    _drawChart: function(seriesData, categories, displayName){
        this.logger.log('_drawChart', seriesData, categories);
        var me = this;
        
        this.down('#display_box').removeAll();

                
        var title_text = Ext.String.format('{0}',displayName);
        var tick_interval = 1;
        
        this.down('#display_box').add({
            xtype: 'rallychart',
            chartData: {
                series: [seriesData]
            }, 
            loadMask: false,
            chartConfig: {
                chart: {},
                title: {
                    text: title_text
                },
                xAxis: [{
                    categories: categories,
                    title: {
                        text: 'Date'
                    }
                }],
                yAxis: [
                    {
                        title: {
                            text: 'Count'
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
    
    _export: function(){
        var filename = Ext.String.format('{0}-growth-{1}.csv', "user", Rally.util.DateTime.format(new Date(),'Y-m-d'));
        if (this.exportData){
            Rally.technicalservices.FileUtilities.saveCSVToFile(this.exportData, filename);
        }
    },
    
    setExportData: function(seriesData, categories, errors){
        var text = ' ,';
        
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
    
    getOptions: function() {
        return [
            {
                text: 'About...',
                handler: this._launchInfo,
                scope: this
            }
        ];
    },
    
    _launchInfo: function() {
        if ( this.about_dialog ) { this.about_dialog.destroy(); }
        this.about_dialog = Ext.create('Rally.technicalservices.InfoLink',{});
    },
    
    isExternal: function(){
        return typeof(this.getAppId()) == 'undefined';
    },
    
    //onSettingsUpdate:  Override
    onSettingsUpdate: function (settings){
        this.logger.log('onSettingsUpdate',settings);
        Ext.apply(this, settings);
        this.launch();
    }
});
