import { useState } from 'react';
import {
  AppBar, Toolbar, Typography, Button, Box, Stack, IconButton, Menu, MenuItem, Divider,
  Drawer, List, ListItemButton, ListItemText, ListSubheader, useMediaQuery, useTheme, Tooltip,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import LogoutIcon from '@mui/icons-material/Logout';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import NotificationBell from '../features/notifications/NotificationBell.jsx';

/**
 * Navigation is GROUPED, not a flat list of 16 links.
 *
 * Sixteen top-level buttons overflowed the toolbar on a normal laptop. The daily-driver
 * screens stay visible; everything else lives in labelled dropdowns. Below `md` the whole
 * thing collapses into a drawer.
 */
const PRIMARY = [
  { to: '/products', label: 'Products' },
  { to: '/orders', label: 'Orders' },
  { to: '/inventory', label: 'Inventory' },
  { to: '/channels', label: 'Channels' },
];

const GROUPS = [
  {
    label: 'Commerce',
    items: [
      { to: '/customers', label: 'Customers' },
      { to: '/pricing', label: 'Pricing' },
      { to: '/listings', label: 'Listings & Sync' },
      { to: '/import', label: 'Import products (CSV)' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { to: '/warehouse', label: 'Warehouse' },
      { to: '/shipping', label: 'Shipping' },
      { to: '/automation', label: 'Automation' },
    ],
  },
  {
    label: 'Insights',
    items: [
      { to: '/analytics', label: 'Analytics' },
      { to: '/ai', label: 'AI' },
      { to: '/search', label: 'Search' },
    ],
  },
  {
    label: 'Settings',
    items: [
      { to: '/admin', label: 'Admin' },
      { to: '/security', label: 'Security' },
      { to: '/developer', label: 'Developer Platform' },
      { to: '/notifications', label: 'Notifications' },
    ],
  },
];

const ALL_LINKS = [...PRIMARY, ...GROUPS.flatMap((g) => g.items)];

/** A dropdown for one group, with the active route highlighted. */
function NavGroup({ group, currentPath }) {
  const [anchor, setAnchor] = useState(null);
  const isActive = group.items.some((i) => i.to === currentPath);

  return (
    <>
      <Button
        onClick={(e) => setAnchor(e.currentTarget)}
        endIcon={<ExpandMoreIcon />}
        sx={{
          color: isActive ? 'primary.main' : 'text.primary',
          fontWeight: isActive ? 700 : 500,
          whiteSpace: 'nowrap',
        }}
      >
        {group.label}
      </Button>
      <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)}>
        {group.items.map((item) => (
          <MenuItem
            key={item.to}
            component={Link}
            to={item.to}
            selected={item.to === currentPath}
            onClick={() => setAnchor(null)}
          >
            {item.label}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}

/** Full navigation in a drawer, for narrow screens. */
function MobileNav({ open, onClose, currentPath }) {
  return (
    <Drawer anchor="left" open={open} onClose={onClose}>
      <Box sx={{ width: 260 }} role="navigation">
        <Typography variant="h6" fontWeight={800} sx={{ p: 2 }}>MCCMS</Typography>
        <Divider />
        <List dense>
          {PRIMARY.map((item) => (
            <ListItemButton key={item.to} component={Link} to={item.to} selected={item.to === currentPath} onClick={onClose}>
              <ListItemText primary={item.label} primaryTypographyProps={{ fontWeight: 600 }} />
            </ListItemButton>
          ))}
          {GROUPS.map((g) => (
            <Box key={g.label}>
              <ListSubheader disableSticky>{g.label}</ListSubheader>
              {g.items.map((item) => (
                <ListItemButton key={item.to} component={Link} to={item.to} selected={item.to === currentPath} onClick={onClose} sx={{ pl: 3 }}>
                  <ListItemText primary={item.label} />
                </ListItemButton>
              ))}
            </Box>
          ))}
        </List>
      </Box>
    </Drawer>
  );
}

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const theme = useTheme();
  const compact = useMediaQuery(theme.breakpoints.down('lg'));
  const [drawer, setDrawer] = useState(false);
  const [userMenu, setUserMenu] = useState(null);

  const activeLabel = ALL_LINKS.find((l) => l.to === pathname)?.label;

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'grey.50' }}>
      <AppBar position="sticky" color="default" elevation={1}>
        <Toolbar sx={{ gap: 1 }}>
          {compact && (
            <IconButton edge="start" onClick={() => setDrawer(true)} aria-label="open navigation">
              <MenuIcon />
            </IconButton>
          )}

          <Typography
            variant="h6" fontWeight={800} component={Link} to="/products"
            sx={{ mr: 2, textDecoration: 'none', color: 'text.primary', whiteSpace: 'nowrap' }}
          >
            MCCMS
          </Typography>

          {compact ? (
            // On narrow screens the toolbar only shows where you are; the drawer has the rest.
            <Typography variant="body2" color="text.secondary" sx={{ flexGrow: 1 }}>
              {activeLabel ?? ''}
            </Typography>
          ) : (
            <Stack direction="row" spacing={0.5} sx={{ flexGrow: 1, alignItems: 'center' }}>
              {PRIMARY.map((item) => (
                <Button
                  key={item.to} component={Link} to={item.to}
                  sx={{
                    color: pathname === item.to ? 'primary.main' : 'text.primary',
                    fontWeight: pathname === item.to ? 700 : 500,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {item.label}
                </Button>
              ))}
              <Divider orientation="vertical" flexItem sx={{ mx: 1, my: 1.5 }} />
              {GROUPS.map((g) => <NavGroup key={g.label} group={g} currentPath={pathname} />)}
            </Stack>
          )}

          <NotificationBell />

          <Tooltip title={user?.email ?? ''}>
            <IconButton onClick={(e) => setUserMenu(e.currentTarget)} sx={{ ml: 0.5 }}>
              <Box sx={{
                width: 32, height: 32, borderRadius: '50%', bgcolor: 'primary.main', color: '#fff',
                display: 'grid', placeItems: 'center', fontSize: 14, fontWeight: 700,
              }}>
                {(user?.email ?? '?')[0].toUpperCase()}
              </Box>
            </IconButton>
          </Tooltip>
          <Menu anchorEl={userMenu} open={!!userMenu} onClose={() => setUserMenu(null)}>
            <MenuItem disabled>
              <Typography variant="caption">{user?.email}</Typography>
            </MenuItem>
            <Divider />
            <MenuItem onClick={() => { setUserMenu(null); logout(); navigate('/login'); }}>
              <LogoutIcon fontSize="small" sx={{ mr: 1 }} /> Log out
            </MenuItem>
          </Menu>
        </Toolbar>
      </AppBar>

      <MobileNav open={drawer} onClose={() => setDrawer(false)} currentPath={pathname} />

      <Box sx={{ maxWidth: 1200, mx: 'auto', p: { xs: 2, md: 3 } }}>{children}</Box>
    </Box>
  );
}
