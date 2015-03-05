Ext.define('Rally.technicalservices.dialog.PickerDialog',{
    extend: 'Rally.ui.dialog.Dialog',
    logger: new Rally.technicalservices.Logger(),
    autoShow: true,
    initComponent: function() {
        this.items = this._getItems();
        this.buttons = this._getButtonConfig();
        this.callParent(arguments);
        this.addEvents(
                'itemselected'
        );
    },
    _onApplyClick: function(){
        this.fireEvent('itemselected',this);
        this.destroy(); 
    },
    _onCancelClick: function() {
        this.destroy();
    },
    _getItems:function(){
        return [{
            xtype: "container",
            layout: {type: 'hbox'},
        }];
    },
    _getButtonConfig: function() {
        return [{
            xtype: "rallybutton",
            itemId: "cancelButton",
            cls: "secondary rly-small",
            text: "Cancel",
            width: 90,
            handler: this._onCancelClick,
            scope: this
        }, {
            xtype: "rallybutton",
            itemId: "applyButton",
            cls: "primary rly-small",
            text: "Apply",
            width: 90,
            handler: this._onApplyClick,
            scope: this,
            disabled: true 
        }]
    },
});