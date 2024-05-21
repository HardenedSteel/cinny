import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon, Icons } from 'folds';
import { useAtomValue } from 'jotai';
import { useDirects } from '../../../state/hooks/roomList';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { mDirectAtom } from '../../../state/mDirectList';
import { allRoomsAtom } from '../../../state/room-list/roomList';
import { roomToUnreadAtom } from '../../../state/room/roomToUnread';
import { getDirectPath, joinPathComponent } from '../../pathUtils';
import { useRoomsUnread } from '../../../state/hooks/unread';
import {
  SidebarAvatar,
  SidebarItem,
  SidebarItemBadge,
  SidebarItemTooltip,
} from '../../../components/sidebar';
import { useDirectSelected } from '../../../hooks/router/useDirectSelected';
import { navToActivePathAtom } from '../../../state/navToActivePath';
import { UnreadBadge } from '../../../components/unread-badge';

export function DirectTab() {
  const navigate = useNavigate();
  const mx = useMatrixClient();
  const navToActivePath = useAtomValue(navToActivePathAtom);

  const mDirects = useAtomValue(mDirectAtom);
  const directs = useDirects(mx, allRoomsAtom, mDirects);
  const directUnread = useRoomsUnread(directs, roomToUnreadAtom);

  const directSelected = useDirectSelected();

  const handleDirectClick = () => {
    const activePath = navToActivePath.get('direct');
    if (activePath) {
      navigate(joinPathComponent(activePath));
      return;
    }

    navigate(getDirectPath());
  };

  return (
    <SidebarItem active={directSelected}>
      <SidebarItemTooltip tooltip="Direct Messages">
        {(triggerRef) => (
          <SidebarAvatar as="button" ref={triggerRef} outlined onClick={handleDirectClick}>
            <Icon src={Icons.User} filled={directSelected} />
          </SidebarAvatar>
        )}
      </SidebarItemTooltip>
      {directUnread && (
        <SidebarItemBadge hasCount={directUnread.total > 0}>
          <UnreadBadge highlight={directUnread.highlight > 0} count={directUnread.total} />
        </SidebarItemBadge>
      )}
    </SidebarItem>
  );
}