Ext.override(Ext.selection.Model,{
    doMultiSelect: function(records, keepExisting, suppressEvent) {
        var me = this,
            selected = me.selected,
            change = false,
            result, i, len, record, commit;

        console.log('domultieselect',records, keepExisting, suppressEvent);
        if (me.locked) {
            return;
        }
        console.log('doMultiSelect',records);
        records = !Ext.isArray(records) ? [records] : records;
        len = records.length;
        if (!keepExisting && selected.getCount() > 0) {
            result = me.deselectDuringSelect(records, selected.getRange(), suppressEvent);
            if (result[0]) {
                // We had a failure during seletion, so jump out
                // Fire selection change if we did deselect anything
                me.maybeFireSelectionChange(result[1] > 0 && !suppressEvent);
                return;
            }
        }

        commit = function() {
            selected.add(record);
            change = true;
        };

        for (i = 0; i < len; i++) {
            record = records[i];
            if (me.isSelected(record)) {
                continue;
            }
            me.lastSelected = record;

            me.onSelectChange(record, true, suppressEvent, commit);
        }
        if (!me.preventFocus) {
            me.setLastFocused(record, suppressEvent);
        }
        // fire selchange if there was a change and there is no suppressEvent flag
        me.maybeFireSelectionChange(change && !suppressEvent);
    }
});
Ext.override(Ext.data.proxy.Server, {
    timeout : 300000,
    processResponse: function(success, operation, request, response, callback, scope) {
        var me = this,
            reader,
            result;

        if (success === true) {
            reader = me.getReader();
            reader.applyDefaults = operation.action === 'read';
            result = reader.read(me.extractResponseData(response));

            if (result.success !== false) {
                
                Ext.apply(operation, {
                    response: response,
                    resultSet: result
                });

                operation.commitRecords(result.records);
                operation.setCompleted();
                operation.setSuccessful();
            } else {
                operation.setException(result.message);
                me.fireEvent('exception', this, response, operation);
            }
        } else {
            if (response) {
                me.setException(operation, response);
            }
            me.fireEvent('exception', this, response, operation);
        }

        
        if (typeof callback == 'function') {
            callback.call(scope || me, operation);
        }

        me.afterRequest(request, success);
    }
});

Ext.override(Ext.util.AbstractMixedCollection,{
    /**
     * Filter by a function. Returns a <i>new</i> collection that has been filtered.
     * The passed function will be called with each object in the collection.
     * If the function returns true, the value is included otherwise it is filtered.
     * @param {Function} fn The function to be called.
     * @param {Mixed} fn.item The collection item.
     * @param {String} fn.key The key of collection item.
     * @param {Object} scope (optional) The scope (<code>this</code> reference) in
     * which the function is executed. Defaults to this MixedCollection.
     * @return {Ext.util.MixedCollection} The new filtered collection
     * @since 1.1.0
     */
    filterBy : function(fn, scope) {
        var me = this,
            newMC  = new me.self(me.initialConfig),
            keys   = me.keys,
            items  = me.items,
            length = items.length,
            i;

        newMC.getKey = me.getKey;

        for (i = 0; i < length; i++) {
            console.log(i,items[i].get('Name'), fn.call(scope || me, items[i],keys[i]));
            if (fn.call(scope || me, items[i], keys[i])) {
                console.log('adding', i,keys[i],items[i].get('Name'));
                newMC.add(keys[i], items[i]);
            } else {
                console.log('not adding')
            }
        }
        console.log(newMC);
        // The add using an external key will make the newMC think that keys cannot be reliably extracted
        // from objects, so that an indexOf call will always have to do a linear search.
        // If the flag is not set in this object, we know that the clone will not need it either.
        newMC.useLinearSearch = true;  //me.useLinearSearch;
        return newMC;
    },
    });

    Ext.override(Ext.data.Store,{
        filterBy: function(fn, scope) {
            var me = this;
            console.log('xxx');
            me.snapshot = me.snapshot || me.data.clone();
            
            me.data = me.queryBy(fn, scope || me);
            me.fireEvent('datachanged', me);
            me.fireEvent('refresh', me);
        },

        /**
         * Query all the cached records in this Store using a filtering function. The specified function
         * will be called with each record in this Store. If the function returns `true` the record is
         * included in the results.
         *
         * This method is not effected by filtering, it will always look from all records inside the store
         * no matter if filter is applied or not.
         *
         * @param {Function} fn The function to be called. It will be passed the following parameters:
         *  @param {Ext.data.Model} fn.record The record to test for filtering. Access field values
         *  using {@link Ext.data.Model#get}.
         *  @param {Object} fn.id The ID of the Record passed.
         * @param {Object} [scope] The scope (this reference) in which the function is executed
         * Defaults to this Store.
         * @return {Ext.util.MixedCollection} Returns an Ext.util.MixedCollection of the matched records
         */
        queryBy: function(fn, scope) {
            var me = this;
            return (me.snapshot || me.data).filterBy(fn, scope || me);
        },

    });