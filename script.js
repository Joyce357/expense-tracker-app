document.addEventListener('DOMContentLoaded', function () {
  const setActiveNavLink = () => {
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    const navLink = document.querySelectorAll('.nav-link');

    navLink.forEach(link => {
      const linkHref = link.getAttribute('href');
      if (linkHref === currentPage) {
        link.classList.add('active');
      } else {
        link.classList.remove('active');
      }
    });
  };

  // Check if user is logged in
  const currentUser = JSON.parse(localStorage.getItem('currentUser'));
  if (!currentUser) {
    // Redirect to login page if not logged in
    window.location.href = 'login.html';
    return;
  }

  // Update welcome message with user's name
  const usernameElement = document.getElementById('username');
  if (usernameElement) {
    usernameElement.textContent = currentUser.name;
  }

  // Update avatar letter with first letter of user's name
  const avatarLetterElement = document.getElementById('avatar-letter');
  if (avatarLetterElement) {
    avatarLetterElement.textContent = currentUser.name.charAt(0).toUpperCase();
  }

  // Logout button functionality
  const logoutButton = document.getElementById('logout-btn');
  if (logoutButton) {
    logoutButton.addEventListener('click', function () {
      // Clear the current user from localStorage
      localStorage.removeItem('currentUser');

      // Redirect to login page
      window.location.href = 'login.html';
    });
  }

  // === Select DOM elements ===
  const toggleFormBtn = document.getElementById('toggle-form');
  const expenseFormCard = document.getElementById('expense-form-card');
  const expenseForm = document.getElementById('expense-form');
  const expenseTableBody = document.querySelector('table tbody');
  const toast = document.getElementById('toast');

  let editingId = null;
  let deleteTimeout = null;

  // === Initialize App ===
  renderExpenses();

  // Set up period filter dropdown
  const periodFilter = document.querySelector('.filter-select[data-filter="period"]');
  if (periodFilter) {
    // Set up the period options
    setupPeriodOptions(periodFilter);

    // Add event listener for period changes
    periodFilter.addEventListener('change', function () {
      const selectedPeriod = this.value;
      handlePeriodChange(selectedPeriod);
    });
  }

  // Set up category filter dropdown
  const categoryFilter = document.querySelector('.filter-select:first-child');
  if (categoryFilter) {
    categoryFilter.addEventListener('change', function() {
      filterExpensesByCategory(this.value);
    });
  }

  // === Toggle Form ===
  toggleFormBtn.addEventListener('click', function () {
    const isHidden = expenseFormCard.style.display === 'none' || !expenseFormCard.style.display;
    expenseFormCard.style.display = isHidden ? 'block' : 'none';
    toggleFormBtn.textContent = isHidden ? '- Hide Form' : '+ Add Expenses';

    // Set today's date as default when opening the form
    if (isHidden) {
      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const dd = String(today.getDate()).padStart(2, '0');
      document.getElementById('expense-date').value = `${yyyy}-${mm}-${dd}`;
    }
  });

  // === Add Expense ===
  expenseForm.addEventListener('submit', function (e) {
    e.preventDefault();

    const description = document.getElementById('description').value.trim();
    const amount = parseFloat(document.getElementById('amount').value).toFixed(2);
    const category = document.getElementById('category').value;
    const rawDate = document.getElementById('expense-date').value;
    const date = new Date(rawDate);
    
    // Format the date for display
    const formattedDate = date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
    
    // Store the ISO date for accurate sorting and filtering
    const isoDate = date.toISOString().split('T')[0]; // YYYY-MM-DD format
    
    // Determine which period this expense belongs to
    const period = getPeriodFromDate(date);
    
    // Get existing expenses for that period
    let expenses = getExpenses(period);

    if (editingId) {
      // Find which period the original expense was in
      const allExpenses = getAllExpenses();
      const originalExpense = allExpenses.find(exp => exp.id == editingId);
      
      if (originalExpense) {
        // If the period has changed, we need to remove from old period and add to new
        const originalPeriod = getPeriodFromDate(new Date(originalExpense.date));
        
        if (originalPeriod !== period) {
          // Remove from original period
          const originalPeriodExpenses = getExpenses(originalPeriod);
          const updatedOriginalExpenses = originalPeriodExpenses.filter(exp => exp.id != editingId);
          saveExpenses(updatedOriginalExpenses, originalPeriod);
          
          // Add to new period
          const expense = { 
            id: editingId, 
            description, 
            amount, 
            category, 
            date: formattedDate,
            isoDate: isoDate
          };
          expenses.unshift(expense);
          saveExpenses(expenses, period);
        } else {
          // Update in the same period
          expenses = expenses.map(exp =>
            exp.id == editingId ? { 
              ...exp, 
              description, 
              amount, 
              category, 
              date: formattedDate,
              isoDate: isoDate 
            } : exp
          );
          saveExpenses(expenses, period);
        }
      }
      
      showToast("Expense updated ✅");
      editingId = null;
    } else {
      // Add new expense
      const expense = { 
        id: Date.now(), 
        description, 
        amount, 
        category, 
        date: formattedDate,
        isoDate: isoDate
      };
      expenses.unshift(expense);
      saveExpenses(expenses, period);
      showToast("Expense added ✅");
    }

    // Re-render expenses for the currently selected period
    const selectedPeriod = document.querySelector('.filter-select[data-filter="period"]').value;
    if (selectedPeriod === 'last3months') {
      renderLast3MonthsExpenses();
    } else if (selectedPeriod === 'custom') {
      applyCustomDateRange();
    } else {
      renderExpenses(selectedPeriod);
    }
    
    expenseForm.reset();
    expenseFormCard.style.display = 'none';
    toggleFormBtn.textContent = '+ Add Expenses';
  });

  // === Edit / Delete ===
  expenseTableBody.addEventListener('click', function (e) {
    const row = e.target.closest('tr');
    if (!row) return;

    if (e.target.classList.contains('btn-edit') || e.target.closest('.btn-edit')) {
      const id = row.getAttribute('data-id');
      if (!id) return;
      
      const category = row.querySelector('.category-badge').textContent.trim();
      const description = row.children[2].textContent;
      const amount = row.children[3].textContent.replace('$', '');
      
      // Find the expense to get the original date
      const allExpenses = getAllExpenses();
      const expense = allExpenses.find(exp => exp.id == id);
      
      if (expense && expense.isoDate) {
        document.getElementById('expense-date').value = expense.isoDate;
      }

      document.getElementById('description').value = description;
      document.getElementById('amount').value = amount;
      document.getElementById('category').value = category;

      editingId = id;
      expenseFormCard.style.display = 'block';
      toggleFormBtn.textContent = '- Hide Form';
      showToast("Edit mode activated ✏️");
    }

    if (e.target.classList.contains('btn-delete') || e.target.closest('.btn-delete')) {
      const id = row.getAttribute('data-id');
      if (id) {
        deleteExpense(id);
        showToast("Expense deleted successfully");
      }
    }
  });

  // Cancel button functionality
  const cancelExpenseBtn = document.getElementById('cancel-expense');
  if (cancelExpenseBtn) {
    cancelExpenseBtn.addEventListener('click', function () {
      expenseFormCard.style.display = 'none';
      toggleFormBtn.textContent = '+ Add Expenses';
      expenseForm.reset();
      editingId = null;
    });
  }

  // Filter expenses by category
  function filterExpensesByCategory(category) {
    const selectedPeriod = document.querySelector('.filter-select[data-filter="period"]').value;
    let expenses;
    
    if (selectedPeriod === 'last3months') {
      expenses = getLast3MonthsExpenses();
    } else if (selectedPeriod === 'custom') {
      // Get the date range
      const startDate = new Date(document.getElementById('start-date').value);
      const endDate = new Date(document.getElementById('end-date').value);
      expenses = getExpensesInDateRange(startDate, endDate);
    } else {
      expenses = getExpenses(selectedPeriod);
    }
    
    if (category !== 'All Categories') {
      expenses = expenses.filter(exp => exp.category === category);
    }
    
    renderFilteredExpenses(expenses);
  }
  
  function renderFilteredExpenses(expenses) {
    const tableBody = document.querySelector('table tbody');
    tableBody.innerHTML = '';
    
    if (expenses.length === 0) {
      const emptyRow = document.createElement('tr');
      emptyRow.innerHTML = `
        <td colspan="5" class="empty-state">
          No expenses found matching your filters.
        </td>
      `;
      tableBody.appendChild(emptyRow);
      
      // Update the monthly total to $0.00
      document.querySelector('.total-amount').textContent = '$0.00';
      
      // Update pie chart to show "No expenses yet"
      updatePieChartEmpty();
    } else {
      // Render each expense
      expenses.forEach(expense => {
        addExpenseToTable(expense);
      });
      
      // Update summary and chart
      updateMonthlyTotal(expenses);
      updatePieChart(expenses);
    }
  }

  // Helper function to get the current month and year as a string (e.g., "May2025")
  function getCurrentPeriod() {
    const now = new Date();
    const month = now.toLocaleString('default', { month: 'short' });
    const year = now.getFullYear();
    return `${month}${year}`;
  }

  // Helper function to get period from a date object
  function getPeriodFromDate(date) {
    const month = date.toLocaleString('default', { month: 'short' });
    const year = date.getFullYear();
    return `${month}${year}`;
  }

  // Get expenses for a specific period
  function getExpenses(period = getCurrentPeriod()) {
    const currentUser = JSON.parse(localStorage.getItem('currentUser'));
    if (!currentUser) return [];
    
    // Get user-specific expenses for the specified period
    const userExpensesKey = `expenses_${currentUser.email}_${period}`;
    return JSON.parse(localStorage.getItem(userExpensesKey)) || [];
  }

  // Save expenses for a specific period
  function saveExpenses(expenses, period = getCurrentPeriod()) {
    const currentUser = JSON.parse(localStorage.getItem('currentUser'));
    if (!currentUser) return;
    
    // Save to user-specific key with period
    const userExpensesKey = `expenses_${currentUser.email}_${period}`;
    localStorage.setItem(userExpensesKey, JSON.stringify(expenses));
  }

  // Set up period dropdown options
  function setupPeriodOptions(dropdown) {
    // Clear existing options
    dropdown.innerHTML = '';
    
    // Add standard options
    const options = [
      { value: getCurrentPeriod(), label: 'This Month' },
      { value: getPreviousPeriod(), label: 'Last Month' },
      { value: 'last3months', label: 'Last 3 Months' },
      { value: 'custom', label: 'Custom Range' }
    ];
    
    options.forEach(option => {
      const optionElement = document.createElement('option');
      optionElement.value = option.value;
      optionElement.textContent = option.label;
      dropdown.appendChild(optionElement);
    });
  }

  // Get previous month period
  function getPreviousPeriod() {
    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1);
    const month = lastMonth.toLocaleString('default', { month: 'short' });
    const year = lastMonth.getFullYear();
    return `${month}${year}`;
  }

  // Handle period change
  function handlePeriodChange(selectedPeriod) {
    // Show loading state
    document.body.classList.add('loading');
    
    setTimeout(() => {
      if (selectedPeriod === 'custom') {
        // Show custom date range picker
        showCustomDateRangePicker();
      } else if (selectedPeriod === 'last3months') {
        // Show expenses from last 3 months
        renderLast3MonthsExpenses();
      } else {
        // Update the period display
        updatePeriodDisplay(selectedPeriod);
        
        // Render expenses for the selected period
        renderExpenses(selectedPeriod);
      }
      
      // Remove loading state
      document.body.classList.remove('loading');
      
      // Show toast notification
      showToast(`Expenses for ${getDisplayNameForPeriod(selectedPeriod)} loaded`);
    }, 500); // Simulate loading time
  }

  // Update the period display in the Monthly Summary card
  function updatePeriodDisplay(period) {
    const periodDisplay = document.querySelector('.summary-header span');
    if (periodDisplay) {
      periodDisplay.textContent = getDisplayNameForPeriod(period);
    }
  }

  // Get a display name for a period code
  function getDisplayNameForPeriod(period) {
    if (period === getCurrentPeriod()) {
      return 'This Month';
    } else if (period === getPreviousPeriod()) {
      return 'Last Month';
    } else if (period === 'last3months') {
      return 'Last 3 Months';
    } else if (period === 'custom') {
      return 'Custom Range';
    } else {
      // For specific month/year periods
      const match = period.match(/([A-Za-z]+)(\d{4})/);
      if (match) {
        return `${match[1]} ${match[2]}`;
      }
      return period;
    }
  }

  // Format date for input field (YYYY-MM-DD)
  function formatDateForInput(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // Show custom date range picker
  function showCustomDateRangePicker() {
    // Check if the date range picker already exists
    let dateRangePicker = document.getElementById('date-range-picker');
    
    if (!dateRangePicker) {
      // Create the date range picker
      dateRangePicker = document.createElement('div');
      dateRangePicker.id = 'date-range-picker';
      dateRangePicker.className = 'card';
      dateRangePicker.style.marginBottom = '20px';
      
      dateRangePicker.innerHTML = `
        <h3>Select Date Range</h3>
        <div class="date-range-form">
          <div class="form-group">
            <label for="start-date">Start Date</label>
            <input type="date" id="start-date" class="form-control">
          </div>
          <div class="form-group">
            <label for="end-date">End Date</label>
            <input type="date" id="end-date" class="form-control">
          </div>
          <button id="apply-date-range" class="btn btn-primary">Apply</button>
        </div>
      `;
      
      // Insert after the dashboard
      const dashboard = document.querySelector('.dashboard');
      dashboard.parentNode.insertBefore(dateRangePicker, dashboard.nextSibling);
      
      // Add event listener for the apply button
      document.getElementById('apply-date-range').addEventListener('click', applyCustomDateRange);
    } else {
      // Show the existing date range picker
      dateRangePicker.style.display = 'block';
    }
    
    // Set default dates (current month)
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    
    document.getElementById('start-date').value = formatDateForInput(firstDay);
    document.getElementById('end-date').value = formatDateForInput(lastDay);
    
    // Clear the expenses table
    const tableBody = document.querySelector('table tbody');
    tableBody.innerHTML = `
      <tr>
        <td colspan="5" class="empty-state">
          Please select a date range and click "Apply" to view expenses.
        </td>
      </tr>
    `;
    
    // Update the monthly total to $0.00
    document.querySelector('.total-amount').textContent = '$0.00';
    
    // Update pie chart to show "No expenses yet"
    updatePieChartEmpty();
    
    // Update the period display
    updatePeriodDisplay('custom');
  }

  // Apply custom date range
  function applyCustomDateRange() {
    const startDate = new Date(document.getElementById('start-date').value);
    const endDate = new Date(document.getElementById('end-date').value);
    
    // Validate dates
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      showToast('Please select valid dates');
      return;
    }
    
    if (startDate > endDate) {
      showToast('Start date must be before end date');
      return;
    }
    
    // Show loading state
    document.body.classList.add('loading');
    
    setTimeout(() => {
      // Get expenses in date range
      const filteredExpenses = getExpensesInDateRange(startDate, endDate);
      
      // Update the UI
      const tableBody = document.querySelector('table tbody');
      tableBody.innerHTML = '';
      
      if (filteredExpenses.length === 0) {
        // Show empty state
        const emptyRow = document.createElement('tr');
        emptyRow.innerHTML = `
          <td colspan="5" class="empty-state">
            No expenses found for the selected date range.
          </td>
        `;
        tableBody.appendChild(emptyRow);
        
        // Update the monthly total to $0.00
        document.querySelector('.total-amount').textContent = '$0.00';
        
        // Update pie chart to show "No expenses yet"
        updatePieChartEmpty();
      } else {
        // Render each expense
        filteredExpenses.forEach(expense => {
          addExpenseToTable(expense);
        });
        
        // Update summary and chart
        updateMonthlyTotal(filteredExpenses);
        updatePieChart(filteredExpenses);
      }
      
      // Update the period display
      const formattedStart = startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      const formattedEnd = endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      const periodDisplay = document.querySelector('.summary-header span');
      if (periodDisplay) {
        periodDisplay.textContent = `${formattedStart} - ${formattedEnd}`;
      }
      
      // Hide the date range picker
      document.getElementById('date-range-picker').style.display = 'none';
      
      // Remove loading state
      document.body.classList.remove('loading');
      
      // Show toast notification
      showToast(`Expenses for custom range loaded`);
    }, 500); // Simulate loading time
  }

  // Get expenses in a specific date range
  function getExpensesInDateRange(startDate, endDate) {
    // Get all expenses
    const allExpenses = getAllExpenses();
    
    // Filter expenses within the date range
    return allExpenses.filter(expense => {
      // Try to use isoDate first if available
      const expenseDate = expense.isoDate 
        ? new Date(expense.isoDate) 
        : new Date(expense.date);
      
      // Set hours to 0 for accurate date comparison
      const expenseDateOnly = new Date(expenseDate.setHours(0, 0, 0, 0));
      const startDateOnly = new Date(startDate.setHours(0, 0, 0, 0));
      const endDateOnly = new Date(endDate.setHours(0, 0, 0, 0));
      
      return expenseDateOnly >= startDateOnly && expenseDateOnly <= endDateOnly;
    }).sort((a, b) => {
      // Sort by date (newest first)
      const dateA = a.isoDate ? new Date(a.isoDate) : new Date(a.date);
      const dateB = b.isoDate ? new Date(b.isoDate) : new Date(b.date);
      return dateB - dateA;
    });
  }

  // Get all expenses from all periods for the current user
  function getAllExpenses() {
    const currentUser = JSON.parse(localStorage.getItem('currentUser'));
    if (!currentUser) return [];
    
    // Get all localStorage keys
    const allKeys = Object.keys(localStorage);
    
    // Filter keys that match the pattern for this user's expenses
    const expenseKeys = allKeys.filter(key => key.startsWith(`expenses_${currentUser.email}_`));
    
    // Combine all expenses
    let allExpenses = [];
    expenseKeys.forEach(key => {
      const expenses = JSON.parse(localStorage.getItem(key)) || [];
      allExpenses = [...allExpenses, ...expenses];
    });
    
    return allExpenses;
  }

  // Get expenses from the last 3 months
  function getLast3MonthsExpenses() {
    const now = new Date();
    let allExpenses = [];
    
    // Get expenses for current month and previous 2 months
    for (let i = 0; i < 3; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() - i);
      const month = date.toLocaleString('default', { month: 'short' });
      const year = date.getFullYear();
      const period = `${month}${year}`;
      
      const expenses = getExpenses(period);
      allExpenses = [...allExpenses, ...expenses];
    }
    
    // Sort by date (newest first)
    allExpenses.sort((a, b) => {
      const dateA = a.isoDate ? new Date(a.isoDate) : new Date(a.date);
      const dateB = b.isoDate ? new Date(b.isoDate) : new Date(b.date);
      return dateB - dateA;
    });
    
    return allExpenses;
  }

  // Render expenses from the last 3 months
  function renderLast3MonthsExpenses() {
    const allExpenses = getLast3MonthsExpenses();
    
    // Update the UI
    const tableBody = document.querySelector('table tbody');
    tableBody.innerHTML = '';
    
    if (allExpenses.length === 0) {
      // Show empty state
      const emptyRow = document.createElement('tr');
      emptyRow.innerHTML = `
        <td colspan="5" class="empty-state">
          No expenses found for the last 3 months.
        </td>
      `;
      tableBody.appendChild(emptyRow);
      
      // Update the monthly total to $0.00
      document.querySelector('.total-amount').textContent = '$0.00';
      
      // Update pie chart to show "No expenses yet"
      updatePieChartEmpty();
    } else {
      // Render each expense
      allExpenses.forEach(expense => {
        addExpenseToTable(expense);
      });
      
      // Update summary and chart
      updateMonthlyTotal(allExpenses);
      updatePieChart(allExpenses);
    }
    
    // Update the period display
    updatePeriodDisplay('last3months');
  }

  // Render expenses for a specific period
  function renderExpenses(period = getCurrentPeriod()) {
    const expenses = getExpenses(period);
    const tableBody = document.querySelector('table tbody');
    
    // Clear the table
    tableBody.innerHTML = '';
    
    if (expenses.length === 0) {
      // Show empty state
      const emptyRow = document.createElement('tr');
      emptyRow.innerHTML = `
        <td colspan="5" class="empty-state">
          No expenses for ${getDisplayNameForPeriod(period)}. Click "+ Add Expenses" to get started.
        </td>
      `;
      tableBody.appendChild(emptyRow);
      
      // Update the monthly total to $0.00
      document.querySelector('.total-amount').textContent = '$0.00';
      
      // Update pie chart to show "No expenses yet"
      updatePieChartEmpty();
    } else {
      // Render each expense
      expenses.forEach(expense => {
        addExpenseToTable(expense);
      });
      
      // Update summary and chart
      updateMonthlyTotal(expenses);
      updatePieChart(expenses);
    }
  }

  function addExpenseToTable(expense) {
    const tableBody = document.querySelector('table tbody');
    
    // If there's an empty state message, clear it first
    if (tableBody.querySelector('.empty-state')) {
      tableBody.innerHTML = '';
    }
    
    const newRow = document.createElement('tr');
    newRow.setAttribute('data-id', expense.id);
    
    // Convert category to lowercase for CSS class
    const categoryClass = expense.category.toLowerCase();
    
    newRow.innerHTML = `
      <td>${expense.date}</td>
      <td><span class="category-badge ${categoryClass}">${expense.category}</span></td>
      <td>${expense.description}</td>
      <td>$${expense.amount}</td>
      <td>
        <div class="action-buttons">
          <div class="btn-icon btn-edit">✏️</div>
          <div class="btn-icon btn-delete">🗑️</div>
        </div>
      </td>
    `;
    tableBody.appendChild(newRow);
  }

  function deleteExpense(id) {
    // Find which period the expense is in
    const allExpenses = getAllExpenses();
    const expenseToDelete = allExpenses.find(exp => exp.id == id);
    
    if (expenseToDelete) {
      // Get the period from the date
      const expenseDate = expenseToDelete.isoDate 
        ? new Date(expenseToDelete.isoDate)
        : new Date(expenseToDelete.date);
      
      const period = getPeriodFromDate(expenseDate);
      let expenses = getExpenses(period);
      expenses = expenses.filter(expense => expense.id != id);
      saveExpenses(expenses, period);
      
      // Re-render the current view
      const selectedPeriod = document.querySelector('.filter-select[data-filter="period"]').value;
      if (selectedPeriod === 'last3months') {
        renderLast3MonthsExpenses();
      } else if (selectedPeriod === 'custom') {
        applyCustomDateRange();
      } else {
        renderExpenses(selectedPeriod);
      }
    }
  }

  // Update monthly total based on provided expenses
  function updateMonthlyTotal(expenses = []) {
    const total = expenses.reduce((sum, exp) => sum + parseFloat(exp.amount), 0);
    document.querySelector('.total-amount').textContent = `$${total.toFixed(2)}`;
  }

  function showToast(message, duration = 3000) {
    const toast = document.getElementById('toast');
    if (!toast) {
      // Create toast element if it doesn't exist
      const newToast = document.createElement('div');
      newToast.id = 'toast';
      newToast.className = 'toast';
      document.body.appendChild(newToast);
      
      // Use the new toast element
      newToast.textContent = message;
      newToast.classList.add('show');
      setTimeout(() => newToast.classList.remove('show'), duration);
    } else {
      toast.textContent = message;
      toast.classList.add('show');
      clearTimeout(deleteTimeout);
      deleteTimeout = setTimeout(() => toast.classList.remove('show'), duration);
    }
  }

  // Function to update pie chart when empty
  function updatePieChartEmpty() {
    const pie = document.getElementById('pie-chart');
    const legendContainer = document.querySelector('.chart-legend');
    
    if (!pie || !legendContainer) return;
    
    // Clear existing legend items
    legendContainer.innerHTML = '';
    
    // Set gray background for empty pie chart
    pie.style.background = 'conic-gradient(var(--gray) 0% 100%)';
    
    // Add a "No data" legend item
    const noDataItem = document.createElement('div');
    noDataItem.className = 'legend-item';
    noDataItem.innerHTML = `
      <div class="legend-color" style="background-color: var(--gray)"></div>
      <span>No expenses yet (0%)</span>
    `;
    legendContainer.appendChild(noDataItem);
  }

  // Update pie chart based on provided expenses
  function updatePieChart(expenses = []) {
    const categoryTotals = {
      Food: 0,
      Transport: 0,
      Rent: 0,
      Entertainment: 0,
      Other: 0
    };
    
    // Calculate totals for each category
    expenses.forEach(exp => {
      if (categoryTotals[exp.category] !== undefined) {
        categoryTotals[exp.category] += parseFloat(exp.amount);
      } else {
        categoryTotals.Other += parseFloat(exp.amount);
      }
    });
    
    const total = Object.values(categoryTotals).reduce((a, b) => a + b, 0);
    const pie = document.getElementById('pie-chart');
    const legendContainer = document.querySelector('.chart-legend');
    
    if (!pie || !legendContainer) return;
    
    // Clear existing legend items
    legendContainer.innerHTML = '';
    
    if (total === 0) {
      updatePieChartEmpty();
      return;
    }
    
    let start = 0;
    const segments = [];
    const colorMap = {
      'Food': '--primary',
      'Transport': '--secondary',
      'Rent': '--warning',
      'Entertainment': '--info',
      'Other': '--info'
    };
    
    // Create segments and legend items
    for (const category in categoryTotals) {
      const value = categoryTotals[category];
      if (value === 0) continue; // Skip categories with zero value
      
      const percent = (value / total) * 100;
      const colorVar = colorMap[category] || '--info';
      
      segments.push(`var(${colorVar}) ${start.toFixed(2)}% ${(start + percent).toFixed(2)}%`);
      
      // Create legend item
      const legendItem = document.createElement('div');
      legendItem.className = 'legend-item';
      legendItem.innerHTML = `
        <div class="legend-color" style="background-color: var(${colorVar})"></div>
        <span>${category} (${Math.round(percent)}%)</span>
      `;
      legendContainer.appendChild(legendItem);
      
      start += percent;
    }
    
    pie.style.background = `conic-gradient(${segments.join(', ')})`;
  }

  const userMenu = document.querySelector('.user-menu');
  const dropdownMenu = document.querySelector('.dropdown-menu');

  if (userMenu && dropdownMenu) {
    let isDropdownOpen = false;

    userMenu.addEventListener('click', function(e) {
      if (!isDropdownOpen) {
        dropdownMenu.style.display = 'block';
        dropdownMenu.style.opacity = '1';
        dropdownMenu.style.visibility = 'visible';
        isDropdownOpen = true;
      } else {
        // Only close if clicking on the avatar, not the dropdown itself
        if (e.target.closest('.dropdown-menu') === null) {
          dropdownMenu.style.display = 'none';
          dropdownMenu.style.opacity = '0';
          dropdownMenu.style.visibility = 'hidden';
          isDropdownOpen = false;
        }
      }
    });

    //close dropdown when clicking outside
    document.addEventListener('click', function(e) {
      if (!userMenu.contains(e.target) && isDropdownOpen) {
        dropdownMenu.style.display = 'none';
        dropdownMenu.style.opacity = '0';
        dropdownMenu.style.visibility = 'hidden';
        isDropdownOpen = false;
      }
    });

    //prevent dropdown from closing when clicking inside it
    dropdownMenu.addEventListener('click', function(e) {
      e.stopPropagation();
    });

    //make sure logout button work
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', function() {
        // Your existing logout code
        localStorage.removeItem('currentUser');
        window.location.href = 'login.html';
      });
    }
  }

});