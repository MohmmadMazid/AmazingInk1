import { useState } from 'react';
import { Badge, IconButton, Menu, MenuItem, Typography, Box, Button, Divider } from '@mui/material';
import NotificationsIcon from '@mui/icons-material/Notifications';
import { useNavigate } from 'react-router-dom';
import { useInbox, useNotifMutations } from './hooks.js';

/** Bell with an unread badge; polls the inbox every 15s. */
export default function NotificationBell() {
  const [anchor, setAnchor] = useState(null);
  const { data } = useInbox({ limit: 6 });
  const { markRead, markAllRead } = useNotifMutations();
  const navigate = useNavigate();
  const unread = data?.meta?.unread ?? 0;

  return (
    <>
      <IconButton onClick={(e) => setAnchor(e.currentTarget)}>
        <Badge badgeContent={unread} color="error"><NotificationsIcon /></Badge>
      </IconButton>
      <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)} slotProps={{ paper: { sx: { width: 360 } } }}>
        <Box sx={{ px: 2, py: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="subtitle2" fontWeight={800}>Notifications</Typography>
          {unread > 0 && <Button size="small" onClick={() => markAllRead.mutate()}>Mark all read</Button>}
        </Box>
        <Divider />
        {!data?.data?.length && <MenuItem disabled><Typography variant="body2">Nothing yet.</Typography></MenuItem>}
        {(data?.data ?? []).map((n) => (
          <MenuItem key={n._id} onClick={() => { if (!n.readAt) markRead.mutate(n._id); setAnchor(null); }}
            sx={{ display: 'block', bgcolor: n.readAt ? undefined : 'action.hover', whiteSpace: 'normal' }}>
            <Typography variant="body2" fontWeight={n.readAt ? 400 : 700}>{n.title}</Typography>
            <Typography variant="caption" color="text.secondary">{n.category} · {new Date(n.createdAt).toLocaleString()}</Typography>
          </MenuItem>
        ))}
        <Divider />
        <MenuItem onClick={() => { setAnchor(null); navigate('/notifications'); }}>
          <Typography variant="body2" color="primary">View all</Typography>
        </MenuItem>
      </Menu>
    </>
  );
}
