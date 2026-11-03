// [column, label, input type, required]. Audit/tenant fields are never editable.
const f = (key, label, type = 'text', required = false) => [key, label, type, required];
export const domains = [
  { table: 'household_events', label: 'Calendar', fields: [f('title','Title','text',true),f('event_date','Date','date'),f('event_time','Time','time'),f('notes','Notes')] },
  { table: 'household_tasks', label: 'Tasks', fields: [f('title','Title','text',true),f('due_date','Due date','date'),f('priority','Priority',['Low','Normal','High'],true),f('notes','Notes'),f('is_done','Done','checkbox'),f('completed_at','Completed at','datetime-local')] },
  { table: 'cleaning_tasks', label: 'Cleaning', fields: [f('title','Title','text',true),f('frequency','Frequency','text',true),f('schedule','Schedule'),f('assigned_to_text','Assigned to'),f('notes','Notes'),f('is_done','Done','checkbox'),f('last_completed_on','Last completed','date')] },
  { table: 'home_care_items', label: 'Home care', fields: [f('title','Title','text',true),f('due_date','Due date','date'),f('status','Status','text',true),f('frequency','Frequency','text',true),f('last_serviced_on','Last serviced','date'),f('provider','Provider'),f('cost','Cost','number',true),f('notes','Notes')] },
  { table: 'home_care_history', label: 'Service history', fields: [f('home_care_item_id','Home care record ID','text',true),f('service_date','Service date','date',true),f('cost','Cost','number',true),f('provider','Provider'),f('notes','Notes')] },
  { table: 'inventory_items', label: 'Inventory', fields: [f('name','Name','text',true),f('purchase_date','Purchased','date'),f('warranty_until','Warranty until','date'),f('model_serial','Model / serial'),f('notes','Notes')] },
  { table: 'household_transactions', label: 'Transactions', fields: [f('description','Description','text',true),f('amount','Amount','number',true),f('transaction_type','Type',['Income','Expense'],true),f('category','Category','text',true),f('transaction_date','Date','date',true)] },
  { table: 'household_bills', label: 'Bills', fields: [f('name','Name','text',true),f('amount','Amount','number',true),f('due_date','Due date','date'),f('is_paid','Paid','checkbox'),f('paid_at','Paid at','datetime-local')] },
  { table: 'household_budgets', key: 'category', label: 'Budgets', fields: [f('category','Category','text',true),f('amount','Amount','number',true)] },
  { table: 'savings_goals', label: 'Savings goals', fields: [f('name','Name','text',true),f('target_amount','Target','number',true),f('saved_amount','Saved','number',true),f('deadline','Deadline','date')] },
  { table: 'household_meals', label: 'Meals', fields: [f('day_of_week','Day',['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],true),f('meal_type','Meal type',['Breakfast','Lunch','Dinner','Snack'],true),f('meal_name','Meal','text',true),f('notes','Notes')] },
  { table: 'grocery_items', label: 'Groceries', fields: [f('item_name','Item','text',true),f('quantity','Quantity'),f('category','Category','text',true),f('is_bought','Bought','checkbox')] }
];
