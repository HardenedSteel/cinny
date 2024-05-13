import React, { MouseEventHandler, useCallback, useMemo, useRef, useState } from 'react';
import { Box, Icon, IconButton, Icons, Line, Scroll, config } from 'folds';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useAtom, useAtomValue } from 'jotai';
import { useNavigate } from 'react-router-dom';
import { Room } from 'matrix-js-sdk';
import { useSpace } from '../../hooks/useSpace';
import { Page, PageContent, PageContentCenter, PageHeroSection } from '../../components/page';
import { HierarchyItem, useSpaceHierarchy } from '../../hooks/useSpaceHierarchy';
import { VirtualTile } from '../../components/virtualizer';
import { spaceRoomsAtom } from '../../state/spaceRooms';
import { MembersDrawer } from '../room/MembersDrawer';
import { useSetting } from '../../state/hooks/settings';
import { ScreenSize, useScreenSize } from '../../hooks/useScreenSize';
import { settingsAtom } from '../../state/settings';
import { LobbyHeader } from './LobbyHeader';
import { LobbyHero } from './LobbyHero';
import { ScrollTopContainer } from '../../components/scroll-top-container';
import { useElementSizeObserver } from '../../hooks/useElementSizeObserver';
import {
  IPowerLevels,
  PowerLevelsContextProvider,
  powerLevelAPI,
  usePowerLevels,
  useRoomsPowerLevels,
} from '../../hooks/usePowerLevels';
import { RoomItemCard } from './RoomItem';
import { mDirectAtom } from '../../state/mDirectList';
import { SpaceItemCard } from './SpaceItem';
import { closedLobbyCategoriesAtom, makeLobbyCategoryId } from '../../state/closedLobbyCategory';
import { useCategoryHandler } from '../../hooks/useCategoryHandler';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { allRoomsAtom } from '../../state/room-list/roomList';
import { getCanonicalAliasOrRoomId } from '../../utils/matrix';
import { getSpaceRoomPath } from '../../pages/pathUtils';
import { HierarchyItemMenu } from './HierarchyItemMenu';
import { StateEvent } from '../../../types/matrix/room';
import { AfterItemDropTarget, CanDropCallback, useDnDMonitor } from './DnD';
import { ASCIILexicalTable, orderKeys } from '../../utils/ASCIILexicalTable';

export function Lobby() {
  const navigate = useNavigate();
  const mx = useMatrixClient();
  const mDirects = useAtomValue(mDirectAtom);
  const allRooms = useAtomValue(allRoomsAtom);
  const allJoinedRooms = useMemo(() => new Set(allRooms), [allRooms]);
  const space = useSpace();
  const spacePowerLevels = usePowerLevels(space);
  const lex = useMemo(() => new ASCIILexicalTable(' '.charCodeAt(0), '~'.charCodeAt(0), 6), []);

  const scrollRef = useRef<HTMLDivElement>(null);
  const heroSectionRef = useRef<HTMLDivElement>(null);
  const [heroSectionHeight, setHeroSectionHeight] = useState<number>();
  const [spaceRooms, setSpaceRooms] = useAtom(spaceRoomsAtom);
  const [isDrawer] = useSetting(settingsAtom, 'isPeopleDrawer');
  const screenSize = useScreenSize();
  const [onTop, setOnTop] = useState(true);
  const [closedCategories, setClosedCategories] = useAtom(closedLobbyCategoriesAtom);

  useElementSizeObserver(
    useCallback(() => heroSectionRef.current, []),
    useCallback((w, height) => setHeroSectionHeight(height), [])
  );

  const getRoom = useCallback(
    (rId: string) => {
      if (allJoinedRooms.has(rId)) {
        return mx.getRoom(rId) ?? undefined;
      }
      return undefined;
    },
    [mx, allJoinedRooms]
  );

  const canEditSpaceChild = useCallback(
    (powerLevels: IPowerLevels) =>
      powerLevelAPI.canSendStateEvent(
        powerLevels,
        StateEvent.SpaceChild,
        powerLevelAPI.getPowerLevel(powerLevels, mx.getUserId() ?? undefined)
      ),
    [mx]
  );

  const [draggingItem, setDraggingItem] = useState<HierarchyItem>();
  const flattenHierarchy = useSpaceHierarchy(
    space.roomId,
    spaceRooms,
    getRoom,
    useCallback(
      (childId) =>
        closedCategories.has(makeLobbyCategoryId(space.roomId, childId)) || !!draggingItem?.space,
      [closedCategories, space.roomId, draggingItem]
    )
  );

  const virtualizer = useVirtualizer({
    count: flattenHierarchy.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 1,
    overscan: 2,
    paddingStart: heroSectionHeight ?? 258,
  });
  const vItems = virtualizer.getVirtualItems();

  const roomsPowerLevels = useRoomsPowerLevels(
    useMemo(
      () => flattenHierarchy.map((i) => mx.getRoom(i.roomId)).filter((r) => !!r) as Room[],
      [mx, flattenHierarchy]
    )
  );

  const canDrop: CanDropCallback = useCallback(
    (item, container): boolean => {
      if (item.roomId === container.item.roomId || item.roomId === container.nextRoomId) {
        // can not drop before or after itself
        return false;
      }

      if (item.space) {
        if (!container.item.space) return false;
        const containerSpaceId = space.roomId;

        if (
          getRoom(containerSpaceId) === undefined ||
          !canEditSpaceChild(roomsPowerLevels.get(containerSpaceId) ?? {})
        ) {
          return false;
        }

        return true;
      }

      const containerSpaceId = container.item.space
        ? container.item.roomId
        : container.item.parentId;

      if (
        getRoom(containerSpaceId) === undefined ||
        !canEditSpaceChild(roomsPowerLevels.get(containerSpaceId) ?? {})
      ) {
        return false;
      }
      return true;
    },
    [getRoom, space.roomId, roomsPowerLevels, canEditSpaceChild]
  );

  const reorderSpace = useCallback(
    (item: HierarchyItem, containerItem: HierarchyItem) => {
      if (!item.parentId) return;

      const childItems = flattenHierarchy
        .filter((i) => i.parentId && i.space)
        .filter((i) => i.roomId !== item.roomId);

      const beforeIndex = childItems.findIndex((i) => i.roomId === containerItem.roomId);
      const insertIndex = beforeIndex + 1;

      childItems.splice(insertIndex, 0, {
        ...item,
        content: { ...item.content, order: undefined },
      });

      const currentOrders = childItems.map((i) => {
        if (typeof i.content.order === 'string' && lex.has(i.content.order)) {
          return i.content.order;
        }
        return undefined;
      });

      const newOrders = orderKeys(lex, currentOrders);

      newOrders?.forEach((orderKey, index) => {
        const itm = childItems[index];
        if (!itm || !itm.parentId) return;
        const parentPL = roomsPowerLevels.get(itm.parentId);
        const canEdit = parentPL && canEditSpaceChild(parentPL);
        if (canEdit && orderKey !== currentOrders[index]) {
          mx.sendStateEvent(
            itm.parentId,
            StateEvent.SpaceChild,
            { ...itm.content, order: orderKey },
            itm.roomId
          );
        }
      });
    },
    [mx, flattenHierarchy, lex, roomsPowerLevels, canEditSpaceChild]
  );

  const reorderRoom = useCallback(
    (item: HierarchyItem, containerItem: HierarchyItem): void => {
      if (!item.parentId) {
        return;
      }
      const containerParentId: string = containerItem.space
        ? containerItem.roomId
        : containerItem.parentId;
      const itemContent = item.content;

      if (item.parentId !== containerParentId) {
        mx.sendStateEvent(item.parentId, StateEvent.SpaceChild, {}, item.roomId);
      }

      const childItems = flattenHierarchy
        .filter((i) => i.parentId === containerParentId && !i.space)
        .filter((i) => i.roomId !== item.roomId);

      const beforeItem: HierarchyItem | undefined = containerItem.space ? undefined : containerItem;
      const beforeIndex = childItems.findIndex((i) => i.roomId === beforeItem?.roomId);
      const insertIndex = beforeIndex + 1;

      childItems.splice(insertIndex, 0, {
        ...item,
        parentId: containerParentId,
        content: { ...itemContent, order: undefined },
      });

      const currentOrders = childItems.map((i) => {
        if (typeof i.content.order === 'string' && lex.has(i.content.order)) {
          return i.content.order;
        }
        return undefined;
      });

      const newOrders = orderKeys(lex, currentOrders);

      newOrders?.forEach((orderKey, index) => {
        const itm = childItems[index];
        if (itm && orderKey !== currentOrders[index]) {
          mx.sendStateEvent(
            containerParentId,
            StateEvent.SpaceChild,
            { ...itm.content, order: orderKey },
            itm.roomId
          );
        }
      });
    },
    [mx, flattenHierarchy, lex]
  );

  useDnDMonitor(
    scrollRef,
    setDraggingItem,
    useCallback(
      (item, container) => {
        if (!canDrop(item, container)) {
          return;
        }
        if (item.space) {
          reorderSpace(item, container.item);
        } else {
          reorderRoom(item, container.item);
          // TODO: prompt when dragging restricted room of private space to public space and etc.
        }
      },
      [reorderRoom, reorderSpace, canDrop]
    )
  );

  const addSpaceRoom = (roomId: string) => setSpaceRooms({ type: 'PUT', roomId });

  const handleCategoryClick = useCategoryHandler(setClosedCategories, (categoryId) =>
    closedCategories.has(categoryId)
  );

  const handleOpenRoom: MouseEventHandler<HTMLButtonElement> = (evt) => {
    const rId = evt.currentTarget.getAttribute('data-room-id');
    if (!rId) return;
    const pSpaceIdOrAlias = getCanonicalAliasOrRoomId(mx, space.roomId);
    navigate(getSpaceRoomPath(pSpaceIdOrAlias, getCanonicalAliasOrRoomId(mx, rId)));
  };

  return (
    <PowerLevelsContextProvider value={spacePowerLevels}>
      <Box grow="Yes">
        <Page>
          <LobbyHeader
            showProfile={!onTop}
            powerLevels={roomsPowerLevels.get(space.roomId) ?? {}}
          />
          <Box style={{ position: 'relative' }} grow="Yes">
            <Scroll ref={scrollRef} hideTrack visibility="Hover">
              <PageContent>
                <PageContentCenter>
                  <ScrollTopContainer
                    scrollRef={scrollRef}
                    anchorRef={heroSectionRef}
                    onVisibilityChange={setOnTop}
                  >
                    <IconButton
                      onClick={() => virtualizer.scrollToOffset(0)}
                      variant="SurfaceVariant"
                      radii="Pill"
                      outlined
                      size="300"
                      aria-label="Scroll to Top"
                    >
                      <Icon src={Icons.ChevronTop} size="300" />
                    </IconButton>
                  </ScrollTopContainer>
                  <div
                    style={{
                      position: 'relative',
                      height: virtualizer.getTotalSize(),
                    }}
                  >
                    <PageHeroSection ref={heroSectionRef} style={{ paddingTop: 0 }}>
                      <LobbyHero />
                    </PageHeroSection>
                    {vItems.map((vItem) => {
                      const item = flattenHierarchy[vItem.index];
                      if (!item) return null;
                      const itemPowerLevel = roomsPowerLevels.get(item.roomId) ?? {};
                      const userPLInItem = powerLevelAPI.getPowerLevel(
                        itemPowerLevel,
                        mx.getUserId() ?? undefined
                      );
                      const canInvite = powerLevelAPI.canDoAction(
                        itemPowerLevel,
                        'invite',
                        userPLInItem
                      );
                      const isJoined = allJoinedRooms.has(item.roomId);

                      const nextRoomId: string | undefined =
                        flattenHierarchy[vItem.index + 1]?.roomId;

                      const dragging =
                        draggingItem?.roomId === item.roomId &&
                        draggingItem.parentId === item.parentId;

                      if (item.space) {
                        const categoryId = makeLobbyCategoryId(space.roomId, item.roomId);
                        const { parentId } = item;
                        const parentPowerLevels = parentId
                          ? roomsPowerLevels.get(parentId) ?? {}
                          : undefined;

                        return (
                          <VirtualTile
                            virtualItem={vItem}
                            style={{
                              paddingTop: vItem.index === 0 ? 0 : config.space.S500,
                            }}
                            ref={virtualizer.measureElement}
                            key={vItem.index}
                          >
                            <SpaceItemCard
                              item={item}
                              joined={allJoinedRooms.has(item.roomId)}
                              categoryId={categoryId}
                              closed={closedCategories.has(categoryId) || !!draggingItem?.space}
                              handleClose={handleCategoryClick}
                              getRoom={getRoom}
                              canEditChild={canEditSpaceChild(
                                roomsPowerLevels.get(item.roomId) ?? {}
                              )}
                              canReorder={
                                parentPowerLevels ? canEditSpaceChild(parentPowerLevels) : false
                              }
                              options={
                                parentId &&
                                parentPowerLevels && (
                                  <HierarchyItemMenu
                                    item={{ ...item, parentId }}
                                    canInvite={canInvite}
                                    joined={isJoined}
                                    canEditChild={canEditSpaceChild(parentPowerLevels)}
                                  />
                                )
                              }
                              before={item.parentId ? undefined : undefined}
                              after={
                                <AfterItemDropTarget
                                  item={item}
                                  nextRoomId={nextRoomId}
                                  afterSpace
                                  canDrop={canDrop}
                                />
                              }
                              onDragging={setDraggingItem}
                              data-dragging={dragging}
                            />
                          </VirtualTile>
                        );
                      }

                      const parentPowerLevels = roomsPowerLevels.get(item.parentId) ?? {};
                      const prevItem: HierarchyItem | undefined = flattenHierarchy[vItem.index - 1];
                      const nextItem: HierarchyItem | undefined = flattenHierarchy[vItem.index + 1];
                      return (
                        <VirtualTile
                          virtualItem={vItem}
                          style={{ paddingTop: config.space.S100 }}
                          ref={virtualizer.measureElement}
                          key={vItem.index}
                        >
                          <RoomItemCard
                            item={item}
                            onSpaceFound={addSpaceRoom}
                            dm={mDirects.has(item.roomId)}
                            firstChild={!prevItem || prevItem.space === true}
                            lastChild={!nextItem || nextItem.space === true}
                            onOpen={handleOpenRoom}
                            getRoom={getRoom}
                            canReorder={canEditSpaceChild(parentPowerLevels)}
                            options={
                              <HierarchyItemMenu
                                item={item}
                                canInvite={canInvite}
                                joined={isJoined}
                                canEditChild={canEditSpaceChild(parentPowerLevels)}
                              />
                            }
                            after={
                              <AfterItemDropTarget
                                item={item}
                                nextRoomId={nextRoomId}
                                canDrop={canDrop}
                              />
                            }
                            data-dragging={dragging}
                            onDragging={setDraggingItem}
                          />
                        </VirtualTile>
                      );
                    })}
                  </div>
                </PageContentCenter>
              </PageContent>
            </Scroll>
          </Box>
        </Page>
        {screenSize === ScreenSize.Desktop && isDrawer && (
          <>
            <Line variant="Background" direction="Vertical" size="300" />
            <MembersDrawer room={space} />
          </>
        )}
      </Box>
    </PowerLevelsContextProvider>
  );
}
