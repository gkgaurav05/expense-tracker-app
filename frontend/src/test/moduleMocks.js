const React = require('react');

const apiMock = {
  setToken: jest.fn(),
  getMe: jest.fn(),
  login: jest.fn(),
  register: jest.fn(),
  forgotPassword: jest.fn(),
  resetPassword: jest.fn(),
  getDashboardSummary: jest.fn(),
  exportCSV: jest.fn(),
  getInsights: jest.fn(),
  getExpenses: jest.fn(),
  getCategories: jest.fn(),
  createCategory: jest.fn(),
  createExpense: jest.fn(),
  updateExpense: jest.fn(),
  deleteExpense: jest.fn(),
  uploadStatement: jest.fn(),
  applyPayeeMappings: jest.fn(),
  categorizeTransactions: jest.fn(),
  createBulkExpenses: jest.fn(),
  getBudgets: jest.fn(),
  createOrUpdateBudget: jest.fn(),
  deleteBudget: jest.fn(),
  getSavings: jest.fn(),
  getAdminStats: jest.fn(),
  getAdminActivity: jest.fn(),
};

const toastMock = {
  success: jest.fn(),
  error: jest.fn(),
};

const navigateMock = jest.fn();

let authState = { user: null };
let searchParamsState = new URLSearchParams();

function setAuthState(nextState) {
  authState = nextState;
}

function setSearchParamsState(value) {
  searchParamsState =
    value instanceof URLSearchParams ? value : new URLSearchParams(value || '');
}

function resetTestDoubles() {
  Object.values(apiMock).forEach((mockFn) => mockFn.mockReset());
  toastMock.success.mockReset();
  toastMock.error.mockReset();
  navigateMock.mockReset();
  authState = { user: null };
  searchParamsState = new URLSearchParams();
}

function stripMotionProps(props) {
  const {
    initial,
    animate,
    exit,
    transition,
    whileHover,
    whileTap,
    layout,
    ...rest
  } = props;
  return rest;
}

const motion = new Proxy(
  {},
  {
    get: (_, tagName) => {
      return ({ children, ...props }) => React.createElement(tagName, stripMotionProps(props), children);
    },
  }
);

const motionModule = {
  motion,
  AnimatePresence: ({ children }) => React.createElement(React.Fragment, null, children),
};

const TabsContext = React.createContext({ value: undefined, onValueChange: () => {} });

const tabsModule = {
  Tabs: ({ value, onValueChange, children, ...props }) =>
    React.createElement(
      TabsContext.Provider,
      { value: { value, onValueChange } },
      React.createElement('div', props, children)
    ),
  TabsList: ({ children, ...props }) => React.createElement('div', props, children),
  TabsTrigger: ({ children, value, onClick, ...props }) =>
    React.createElement(TabsContext.Consumer, null, (context) =>
      React.createElement(
        'button',
        {
          type: 'button',
          ...props,
          'data-state': context.value === value ? 'active' : 'inactive',
          onClick: (event) => {
            if (onClick) onClick(event);
            if (context.onValueChange) context.onValueChange(value);
          },
        },
        children
      )
    ),
};

const tooltipModule = {
  TooltipProvider: ({ children }) => React.createElement(React.Fragment, null, children),
  Tooltip: ({ children }) => React.createElement(React.Fragment, null, children),
  TooltipTrigger: ({ children }) => React.createElement(React.Fragment, null, children),
  TooltipContent: ({ children }) => React.createElement('div', null, children),
};

const selectModule = {
  Select: ({ children }) => React.createElement('div', null, children),
  SelectTrigger: ({ children, ...props }) => React.createElement('button', { type: 'button', ...props }, children),
  SelectValue: ({ placeholder }) => React.createElement('span', null, placeholder),
  SelectContent: ({ children }) => React.createElement('div', null, children),
  SelectItem: ({ children, value }) => React.createElement('div', { 'data-value': value }, children),
};

const progressModule = {
  Progress: ({ value, ...props }) => React.createElement('div', { ...props, 'data-value': String(value ?? 0) }),
};

const spendingChartsModule = {
  DailySpendingChart: ({ data }) =>
    React.createElement('div', { 'data-testid': 'daily-spending-chart' }, `points:${data?.length || 0}`),
  CategoryPieChart: ({ data }) =>
    React.createElement('div', { 'data-testid': 'category-pie-chart' }, `slices:${data?.length || 0}`),
};

const budgetAlertsModule = {
  __esModule: true,
  default: ({ month }) => React.createElement('div', { 'data-testid': 'budget-alerts' }, month),
};

const rechartsModule = {
  ResponsiveContainer: ({ children }) => React.createElement('div', { 'data-testid': 'responsive-container' }, children),
  BarChart: ({ children }) => React.createElement('div', { 'data-testid': 'bar-chart' }, children),
  Bar: () => React.createElement('div', { 'data-testid': 'bar-series' }),
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
};

const apiModule = {
  api: apiMock,
  formatINR: (value) => `Rs.${value || 0}`,
};

const toastModule = {
  toast: toastMock,
};

const routerModule = {
  useNavigate: () => navigateMock,
  useSearchParams: () => [searchParamsState],
  Link: ({ children, to, ...props }) => React.createElement('a', { href: to, ...props }, children),
  NavLink: ({ children, to, className, end, ...props }) => {
    const resolvedClass = typeof className === 'function' ? className({ isActive: false }) : className;
    return React.createElement('a', { href: to, className: resolvedClass, ...props }, children);
  },
  Navigate: ({ to, replace }) => React.createElement('div', { 'data-testid': 'navigate', 'data-to': to, 'data-replace': String(Boolean(replace)) }),
};

const authModule = {
  useAuth: () => authState,
};

const dialogModule = {
  Dialog: ({ open, children }) => (open ? React.createElement('div', { 'data-testid': 'dialog-root' }, children) : null),
  DialogContent: ({ children, ...props }) => React.createElement('div', props, children),
  DialogHeader: ({ children, ...props }) => React.createElement('div', props, children),
  DialogTitle: ({ children, ...props }) => React.createElement('div', props, children),
};

const checkboxModule = {
  Checkbox: ({ checked, onCheckedChange, ...props }) =>
    React.createElement('input', {
      ...props,
      type: 'checkbox',
      checked: Boolean(checked),
      onChange: (event) => onCheckedChange?.(event.target.checked),
    }),
};

module.exports = {
  apiMock,
  toastMock,
  navigateMock,
  setAuthState,
  setSearchParamsState,
  resetTestDoubles,
  motionModule,
  tabsModule,
  tooltipModule,
  selectModule,
  progressModule,
  spendingChartsModule,
  budgetAlertsModule,
  rechartsModule,
  apiModule,
  toastModule,
  routerModule,
  authModule,
  dialogModule,
  checkboxModule,
};
