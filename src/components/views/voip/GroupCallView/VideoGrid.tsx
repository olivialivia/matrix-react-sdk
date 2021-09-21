/*
Copyright 2021 New Vector Ltd

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useDrag } from "react-use-gesture";
import { useSprings, animated } from "@react-spring/web";
import classNames from "classnames";
import useMeasure from "react-use-measure";
import moveArrItem from "lodash-move";
import { GroupCallParticipant } from "matrix-js-sdk/src/webrtc/groupCallParticipant";

function useIsMounted() {
    const isMountedRef = useRef(false);

    useEffect(() => {
        isMountedRef.current = true;

        return () => {
            isMountedRef.current = false;
        };
    }, []);

    return isMountedRef;
}

function isInside([x, y]: number[], targetTile: { x: number, y: number, height: number, width: number}): boolean {
    const left = targetTile.x;
    const top = targetTile.y;
    const bottom = targetTile.y + targetTile.height;
    const right = targetTile.x + targetTile.width;

    if (x < left || x > right || y < top || y > bottom) {
        return false;
    }

    return true;
}

function getTilePositions(tileCount: number, presenterTileCount: number, gridWidth: number, gridHeight: number) {
    if (tileCount === 0) {
        return [];
    }

    if (tileCount > 12) {
        console.warn("Over 12 tiles is not currently supported");
    }

    const gap = 8;

    const { layoutDirection, participantGridRatio } = getGridLayout(
        tileCount,
        presenterTileCount,
        gridWidth,
        gridHeight,
    );

    let participantGridWidth: number;
    let participantGridHeight: number;

    if (layoutDirection === "vertical") {
        participantGridWidth = gridWidth;
        participantGridHeight = Math.round(gridHeight * participantGridRatio);
    } else {
        participantGridWidth = Math.round(gridWidth * participantGridRatio);
        participantGridHeight = gridHeight;
    }

    const participantTileCount = tileCount - presenterTileCount;

    const participantGridPositions = getSubGridPositions(
        participantTileCount,
        participantGridWidth,
        participantGridHeight,
        gap,
    );
    const participantGridBounds = getSubGridBoundingBox(participantGridPositions);

    let presenterGridWidth: number;
    let presenterGridHeight: number;

    if (presenterTileCount === 0) {
        presenterGridWidth = 0;
        presenterGridHeight = 0;
    } else if (layoutDirection === "vertical") {
        presenterGridWidth = gridWidth;
        presenterGridHeight =
            gridHeight -
            (participantGridBounds.height + (participantTileCount ? gap * 2 : 0));
    } else {
        presenterGridWidth =
            gridWidth -
            (participantGridBounds.width + (participantTileCount ? gap * 2 : 0));
        presenterGridHeight = gridHeight;
    }

    const presenterGridPositions = getSubGridPositions(
        presenterTileCount,
        presenterGridWidth,
        presenterGridHeight,
        gap,
    );

    const tilePositions = [
        ...presenterGridPositions,
        ...participantGridPositions,
    ];

    centerTiles(
        presenterGridPositions,
        presenterGridWidth,
        presenterGridHeight,
        0,
        0,
    );

    if (layoutDirection === "vertical") {
        centerTiles(
            participantGridPositions,
            gridWidth,
            gridHeight - presenterGridHeight,
            0,
            presenterGridHeight,
        );
    } else {
        centerTiles(
            participantGridPositions,
            gridWidth - presenterGridWidth,
            gridHeight,
            presenterGridWidth,
            0,
        );
    }

    return tilePositions;
}

function getSubGridBoundingBox(positions) {
    let left = 0;
    let right = 0;
    let top = 0;
    let bottom = 0;

    for (let i = 0; i < positions.length; i++) {
        const { x, y, width, height } = positions[i];

        if (i === 0) {
            left = x;
            right = x + width;
            top = y;
            bottom = y + height;
        } else {
            if (x < left) {
                left = x;
            }

            if (y < top) {
                top = y;
            }

            if (x + width > right) {
                right = x + width;
            }

            if (y + height > bottom) {
                bottom = y + height;
            }
        }
    }

    return {
        left,
        right,
        top,
        bottom,
        width: right - left,
        height: bottom - top,
    };
}

function getGridLayout(tileCount: number, presenterTileCount: number, gridWidth: number, gridHeight: number) {
    let layoutDirection = "horizontal";
    let participantGridRatio = 1;

    if (presenterTileCount === 0) {
        return { participantGridRatio, layoutDirection };
    }

    const gridAspectRatio = gridWidth / gridHeight;

    if (gridAspectRatio < 1) {
        layoutDirection = "vertical";
        participantGridRatio = 1 / 3;
    } else {
        layoutDirection = "horizontal";
        participantGridRatio = 1 / 3;
    }

    return { participantGridRatio, layoutDirection };
}

function centerTiles(positions, gridWidth, gridHeight, offsetLeft, offsetTop) {
    const bounds = getSubGridBoundingBox(positions);

    const leftOffset = Math.round((gridWidth - bounds.width) / 2) + offsetLeft;
    const topOffset = Math.round((gridHeight - bounds.height) / 2) + offsetTop;

    applyTileOffsets(positions, leftOffset, topOffset);

    return positions;
}

function applyTileOffsets(positions, leftOffset, topOffset) {
    for (const position of positions) {
        position.x += leftOffset;
        position.y += topOffset;
    }

    return positions;
}

function getSubGridLayout(tileCount, gridWidth, gridHeight) {
    const gridAspectRatio = gridWidth / gridHeight;

    let columnCount: number;
    let rowCount: number;
    let tileAspectRatio = 16 / 9;

    if (gridAspectRatio < 3 / 4) {
        // Phone
        if (tileCount === 1) {
            columnCount = 1;
            rowCount = 1;
            tileAspectRatio = 0;
        } else if (tileCount <= 4) {
            columnCount = 1;
            rowCount = tileCount;
        } else if (tileCount <= 12) {
            columnCount = 2;
            rowCount = Math.ceil(tileCount / columnCount);
            tileAspectRatio = 0;
        } else {
            // Unsupported
            columnCount = 3;
            rowCount = Math.ceil(tileCount / columnCount);
            tileAspectRatio = 1;
        }
    } else if (gridAspectRatio < 1) {
        // Tablet
        if (tileCount === 1) {
            columnCount = 1;
            rowCount = 1;
            tileAspectRatio = 0;
        } else if (tileCount <= 4) {
            columnCount = 1;
            rowCount = tileCount;
        } else if (tileCount <= 12) {
            columnCount = 2;
            rowCount = Math.ceil(tileCount / columnCount);
        } else {
            // Unsupported
            columnCount = 3;
            rowCount = Math.ceil(tileCount / columnCount);
            tileAspectRatio = 1;
        }
    } else if (gridAspectRatio < 17 / 9) {
        // Computer
        if (tileCount === 1) {
            columnCount = 1;
            rowCount = 1;
        } else if (tileCount === 2) {
            columnCount = 2;
            rowCount = 1;
        } else if (tileCount <= 4) {
            columnCount = 2;
            rowCount = 2;
        } else if (tileCount <= 6) {
            columnCount = 3;
            rowCount = 2;
        } else if (tileCount <= 8) {
            columnCount = 4;
            rowCount = 2;
            tileAspectRatio = 1;
        } else if (tileCount <= 12) {
            columnCount = 4;
            rowCount = 3;
            tileAspectRatio = 1;
        } else {
            // Unsupported
            columnCount = 4;
            rowCount = 4;
        }
    } else if (gridAspectRatio <= 32 / 9) {
        // Ultrawide
        if (tileCount === 1) {
            columnCount = 1;
            rowCount = 1;
        } else if (tileCount === 2) {
            columnCount = 2;
            rowCount = 1;
        } else if (tileCount <= 4) {
            columnCount = 2;
            rowCount = 2;
        } else if (tileCount <= 6) {
            columnCount = 3;
            rowCount = 2;
        } else if (tileCount <= 8) {
            columnCount = 4;
            rowCount = 2;
        } else if (tileCount <= 12) {
            columnCount = 4;
            rowCount = 3;
        } else {
            // Unsupported
            columnCount = 4;
            rowCount = 4;
        }
    } else {
        // Super Ultrawide
        if (tileCount <= 6) {
            columnCount = tileCount;
            rowCount = 1;
        } else {
            columnCount = Math.ceil(tileCount / 2);
            rowCount = 2;
        }
    }

    return { columnCount, rowCount, tileAspectRatio };
}

function getSubGridPositions(tileCount, gridWidth, gridHeight, gap) {
    if (tileCount === 0) {
        return [];
    }

    const { columnCount, rowCount, tileAspectRatio } = getSubGridLayout(
        tileCount,
        gridWidth,
        gridHeight,
    );

    const newTilePositions = [];

    const boxWidth = Math.round(
        (gridWidth - gap * (columnCount + 1)) / columnCount,
    );
    const boxHeight = Math.round((gridHeight - gap * (rowCount + 1)) / rowCount);

    let tileWidth: number;
    let tileHeight: number;

    if (tileAspectRatio) {
        const boxAspectRatio = boxWidth / boxHeight;

        if (boxAspectRatio > tileAspectRatio) {
            tileWidth = boxHeight * tileAspectRatio;
            tileHeight = boxHeight;
        } else {
            tileWidth = boxWidth;
            tileHeight = boxWidth / tileAspectRatio;
        }
    } else {
        tileWidth = boxWidth;
        tileHeight = boxHeight;
    }

    for (let i = 0; i < tileCount; i++) {
        const verticalIndex = Math.floor(i / columnCount);
        const top = verticalIndex * gap + verticalIndex * tileHeight;

        let rowItemCount;

        if (verticalIndex + 1 === rowCount && tileCount % columnCount !== 0) {
            rowItemCount = tileCount % columnCount;
        } else {
            rowItemCount = columnCount;
        }

        const horizontalIndex = i % columnCount;

        let centeringPadding = 0;

        if (rowItemCount < columnCount) {
            const subgridWidth = tileWidth * columnCount + (gap * columnCount - 1);
            centeringPadding = Math.round(
                (subgridWidth - (tileWidth * rowItemCount + (gap * rowItemCount - 1))) /
                2,
            );
        }

        const left =
            centeringPadding + gap * horizontalIndex + tileWidth * horizontalIndex;

        newTilePositions.push({
            width: tileWidth,
            height: tileHeight,
            x: left,
            y: top,
        });
    }

    return newTilePositions;
}

interface IVideoGridProps {
    participants: GroupCallParticipant[];
    layout: string;
}

export default function VideoGrid({ participants, layout }: IVideoGridProps) {
    const [{ tiles, tilePositions }, setTileState] = useState({
        tiles: [],
        tilePositions: [],
    });
    const draggingTileRef = useRef(null);
    const lastTappedRef = useRef({});
    const lastLayoutRef = useRef(layout);
    const isMounted = useIsMounted();

    const [gridRef, gridBounds] = useMeasure();

    useEffect(() => {
        setTileState(({ tiles }) => {
            const newTiles = [];
            const removedTileKeys = [];

            for (const tile of tiles) {
                let participant = participants.find(
                    (participant) => participant.member.userId === tile.key,
                );

                let remove = false;

                if (!participant) {
                    remove = true;
                    participant = tile.participant;
                    removedTileKeys.push(tile.key);
                }

                let presenter;

                if (layout === "spotlight") {
                    presenter = participant.isActiveSpeaker();
                } else {
                    presenter = layout === lastLayoutRef.current ? tile.presenter : false;
                }

                newTiles.push({
                    key: participant.member.userId,
                    participant,
                    remove,
                    presenter,
                });
            }

            for (const participant of participants) {
                if (newTiles.some(({ key }) => participant.member.userId === key)) {
                    continue;
                }

                // Added tiles
                newTiles.push({
                    key: participant.member.userId,
                    participant,
                    remove: false,
                    presenter: layout === "spotlight" && participant.isActiveSpeaker(),
                });
            }

            newTiles.sort((a, b) => (b.presenter ? 1 : 0) - (a.presenter ? 1 : 0));

            if (removedTileKeys.length > 0) {
                setTimeout(() => {
                    if (!isMounted.current) {
                        return;
                    }

                    setTileState(({ tiles }) => {
                        const newTiles = tiles.filter(
                            (tile) => !removedTileKeys.includes(tile.key),
                        );

                        const presenterTileCount = newTiles.reduce(
                            (count, tile) => count + (tile.presenter ? 1 : 0),
                            0,
                        );

                        return {
                            tiles: newTiles,
                            tilePositions: getTilePositions(
                                newTiles.length,
                                presenterTileCount,
                                gridBounds.width,
                                gridBounds.height,
                            ),
                        };
                    });
                }, 250);
            }

            const presenterTileCount = newTiles.reduce(
                (count, tile) => count + (tile.presenter ? 1 : 0),
                0,
            );

            lastLayoutRef.current = layout;

            return {
                tiles: newTiles,
                tilePositions: getTilePositions(
                    newTiles.length,
                    presenterTileCount,
                    gridBounds.width,
                    gridBounds.height,
                ),
            };
        });
    }, [participants, gridBounds, layout, isMounted]);

    const animate = useCallback(
        (tiles) => (tileIndex) => {
            const tile = tiles[tileIndex];
            const tilePosition = tilePositions[tileIndex];
            const draggingTile = draggingTileRef.current;
            const dragging = draggingTile && tile.key === draggingTile.key;
            const remove = tile.remove;

            if (dragging) {
                return {
                    width: tilePosition.width,
                    height: tilePosition.height,
                    x: draggingTile.offsetX + draggingTile.x,
                    y: draggingTile.offsetY + draggingTile.y,
                    scale: 1.1,
                    opacity: 1,
                    zIndex: 1,
                    shadow: 15,
                    immediate: (key) => key === "zIndex" || key === "x" || key === "y",
                    from: {
                        scale: 0,
                        opacity: 0,
                    },
                    reset: false,
                };
            } else {
                return {
                    ...tilePosition,
                    scale: remove ? 0 : 1,
                    opacity: remove ? 0 : 1,
                    zIndex: 0,
                    shadow: 1,
                    from: {
                        scale: 0,
                        opacity: 0,
                    },
                    reset: false,
                    immediate: (key) => key === "zIndex",
                };
            }
        },
        [tilePositions],
    );

    const [springs, api] = useSprings(tiles.length, animate(tiles), [
        tilePositions,
        tiles,
    ]);

    const onTap = useCallback(
        (tileKey) => {
            const lastTapped = lastTappedRef.current[tileKey];

            if (!lastTapped || Date.now() - lastTapped > 500) {
                lastTappedRef.current[tileKey] = Date.now();
                return;
            }

            lastTappedRef.current[tileKey] = 0;

            const tile = tiles.find((tile) => tile.key === tileKey);

            if (!tile) {
                return;
            }

            const participant = tile.participant;

            setTileState((state) => {
                let presenterTileCount = 0;

                const newTiles = state.tiles.map((tile) => {
                    let newTile = tile;

                    if (tile.participant === participant) {
                        newTile = { ...tile, presenter: !tile.presenter };
                    }

                    if (newTile.presenter) {
                        presenterTileCount++;
                    }

                    return newTile;
                });

                newTiles.sort((a, b) => (b.presenter ? 1 : 0) - (a.presenter ? 1 : 0));

                presenterTileCount;

                return {
                    ...state,
                    tiles: newTiles,
                    tilePositions: getTilePositions(
                        newTiles.length,
                        presenterTileCount,
                        gridBounds.width,
                        gridBounds.height,
                    ),
                };
            });
        },
        [tiles, gridBounds],
    );

    const bind = useDrag(
        ({ args: [key], active, xy, movement, tap, event }) => {
            event.preventDefault();

            if (tap) {
                onTap(key);
                return;
            }

            const dragTileIndex = tiles.findIndex((tile) => tile.key === key);
            const dragTile = tiles[dragTileIndex];
            const dragTilePosition = tilePositions[dragTileIndex];

            let newTiles = tiles;

            const cursorPosition = [xy[0] - gridBounds.left, xy[1] - gridBounds.top];

            for (
                let hoverTileIndex = 0;
                hoverTileIndex < tiles.length;
                hoverTileIndex++
            ) {
                const hoverTile = tiles[hoverTileIndex];
                const hoverTilePosition = tilePositions[hoverTileIndex];

                if (hoverTile.key === key) {
                    continue;
                }

                if (isInside(cursorPosition, hoverTilePosition)) {
                    newTiles = moveArrItem(tiles, dragTileIndex, hoverTileIndex);

                    newTiles = newTiles.map((tile) => {
                        if (tile === hoverTile) {
                            return { ...tile, presenter: dragTile.presenter };
                        } else if (tile === dragTile) {
                            return { ...tile, presenter: hoverTile.presenter };
                        } else {
                            return tile;
                        }
                    });

                    newTiles.sort(
                        (a, b) => (b.presenter ? 1 : 0) - (a.presenter ? 1 : 0),
                    );

                    setTileState((state) => ({ ...state, tiles: newTiles }));
                    break;
                }
            }

            if (active) {
                if (!draggingTileRef.current) {
                    draggingTileRef.current = {
                        key: dragTile.key,
                        offsetX: dragTilePosition.x,
                        offsetY: dragTilePosition.y,
                    };
                }

                draggingTileRef.current.x = movement[0];
                draggingTileRef.current.y = movement[1];
            } else {
                draggingTileRef.current = null;
            }

            api.start(animate(newTiles));
        },
        { filterTaps: true, enabled: layout === "gallery" },
    );

    return (
        <div className="mx_VideoGrid" ref={gridRef}>
            { springs.map(({ shadow, ...style }, i) => {
                const tile = tiles[i];

                return (
                    <ParticipantTile
                        {...bind(tile.key)}
                        key={tile.key}
                        style={{
                            boxShadow: shadow.to(
                                (s) => `rgba(0, 0, 0, 0.5) 0px ${s}px ${2 * s}px 0px`,
                            ),
                            ...style,
                        }}
                        {...tile}
                    />
                );
            }) }
        </div>
    );
}

VideoGrid.defaultProps = {
    layout: "gallery",
};

interface IParticipantTileProps {
    style: any;
    participant: GroupCallParticipant;
    remove: boolean;
    presenter: boolean;
}

function ParticipantTile({ style, participant, remove, presenter, ...rest }: IParticipantTileProps) {
    const videoRef = useRef<HTMLVideoElement>();

    useEffect(() => {
        if (participant.usermediaStream) {
            if (!participant.call) {
                videoRef.current.muted = true;
            }

            videoRef.current.srcObject = participant.usermediaStream;
            videoRef.current.play();
        } else {
            videoRef.current.srcObject = null;
        }
    }, [participant.usermediaStream, participant.call]);

    // Firefox doesn't respect the disablePictureInPicture attribute
    // https://bugzilla.mozilla.org/show_bug.cgi?id=1611831

    return (
        <animated.div className="mx_participantTile" style={style} {...rest}>
            <div
                className={classNames("mx_participantName", {
                    "mx_speaking": participant.usermediaFeed?.isSpeaking(),
                })}
            >
                { participant.usermediaFeed?.isSpeaking() ? (
                    <i />
                ) : participant.isAudioMuted() ? (
                    <i className="mx_muteMicIcon" />
                ) : null }
                <span>{ participant.member.rawDisplayName }</span>
            </div>
            { participant.isVideoMuted() && (
                <i className="mx_videoMuted" />
            ) }
            <video ref={videoRef} playsInline disablePictureInPicture />
        </animated.div>
    );
}