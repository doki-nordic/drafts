
import { request } from "./comm";
import { cached, fatalError } from "./utils";
import { Config } from "./config";
import { Board, RawTest, Sample, Test, workspaceBoards, workspaceInit, workspaceSamples } from "./workspace";
import ReactDOM from 'react-dom';
import { createRoot } from "react-dom/client";
import React, { SyntheticEvent } from "react";
import { Button, Callout, Card, CardList, Elevation, FormGroup, InputGroup, Intent, MenuItem, Popover, Menu } from "@blueprintjs/core";

import 'normalize.css/normalize.css';
import '@blueprintjs/core/lib/css/blueprint.css';
import '@blueprintjs/select/lib/css/blueprint-select.css';
import '@blueprintjs/icons/lib/css/blueprint-icons.css';
import { ItemPredicate, ItemRenderer, ItemsEqualProp, Suggest, SuggestProps } from "@blueprintjs/select";
import { getState, ListItem, reloadReactState, setState, State } from "./state";


let commands = `

<% command("Build", sample && board && buildDir) %>

cd <% sample %>
ncs west build \\
    -b <% board %> \\
    -d <% buildDir %> \\
    <%! if (test) { %>-T <% test %><%! } %>

<% command("Rebuild", sample && board && buildDir) %>

cd <% sample %>
rm -Rf <% buildDir %>
ncs west build \\
    -b <% board %> \\
    -d <% buildDir %> \\
    <%! if (test) { %>-T <% test %><%! } %>

<% command("Menu Config", sample && board && buildDir) %>
cd <% sample %>
ncs west build \\
    -d <% buildDir %> \\
    -t menuconfig

<% command("GUI Config", sample && board && buildDir) %>
cd <% sample %>
ncs west build \\
    -d <% buildDir %> \\
    -t guiconfig

<%! for (const domain of domains) { %>

    <% command("Menu Config " + domain, sample && board && buildDir && domain != defaultDomain) %>
    ncs west build \\
        -d <% buildDir %> \\
        -t <% domain %>_menuconfig

    <% command("GUI Config " + domain, sample && board && buildDir && domain != defaultDomain) %>
    ncs west build \\
        -d <% buildDir %> \\
        -t <% domain %>_guiconfig

<%! } %>


`;


function escapeRegExp(text: string) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function queryMatcher(query: string) {
    //let parts = query.split(/(?:[^\w\x7F-\uFFFF]|(?:(?<=\d)(?!\d))|(?:(?<!\d)(?=\d)))+/gm)
    let parts = query.split(/(?:[^\w\x7F-\uFFFF])+/gm)
        .map(x => x.trim())
        .filter(x => x)
        .map(x => escapeRegExp(x))
        .join('|');
    if (parts.length === 0) return undefined;
    return new RegExp('(' + parts + ')', 'i');
}

function highlighSearchResult(text: string, matcher?: RegExp): any[] {
    if (!matcher) return [text];
    let parts = text.split(matcher);
    if (parts.length < 3) return [text];
    let res: any[] = [];
    parts.forEach((part, index) => {
        if (index % 2 === 1) res.push((<b key={index}>{part}</b>));
        else res.push(part);
    });
    return res;
}

const renderListItem: ItemRenderer<ListItem> = (item, props) => {
    if (!props.modifiers.matchesPredicate) {
        return null;
    }
    let matcher = queryMatcher(props.query);
    return (
        <MenuItem
            icon={item.icon as any ?? 'blank'}
            active={props.modifiers.active}
            disabled={props.modifiers.disabled}
            onClick={props.handleClick}
            onFocus={props.handleFocus}
            {... { ref: props.ref }}
            roleStructure="listoption"
            text={highlighSearchResult(item.value, matcher)}
            key={item.value}
            label={item.comment}
        />
    );
};

const samplesEqual: ItemsEqualProp<ListItem> = (a, b) => {
    return a.value === b.value;
}

const filterSamples: ItemPredicate<ListItem> = (query, item, index, exactMatch) => {
    if (exactMatch) {
        return query.toLowerCase().trim() === item.value.toLowerCase().trim();
    } else {
        let regexp = queryMatcher(query);
        return regexp?.test(`${item.value}\x00${item.comment}\x00${item.keywords}`) ?? true;
    }
};

const renderNewItem = (
    query: string,
    active: boolean,
    handleClick: React.MouseEventHandler<HTMLElement>,
) => (
    <MenuItem
        icon="add"
        text={query}
        roleStructure="listoption"
        active={active}
        onClick={handleClick}
        shouldDismissPopover={false}
    />
);


function SelectListBox(props: Omit<SuggestProps<ListItem>, 'inputValueRenderer' | 'itemsEqual' | 'itemPredicate' | 'itemRenderer' | 'popoverProps'> & {}) {
    return (<Suggest<ListItem>
        inputValueRenderer={(item) => item.value}
        createNewItemRenderer={renderNewItem}
        createNewItemPosition="first"
        itemsEqual={samplesEqual}
        itemPredicate={filterSamples}
        itemRenderer={renderListItem}
        resetOnClose={true}
        resetOnSelect={true}

        popoverProps={{ minimal: true, matchTargetWidth: true }}
        {...props}
    />);
}


let oldCustomSample: Sample | undefined = undefined;

export function createSample(value: string): Sample {
    value = value.trim().replace(/^[/\\]+|[/\\]+$|/g, '');
    if (oldCustomSample === undefined || oldCustomSample.value !== value) {
        oldCustomSample = {
            raw: undefined,
            description: '',
            name: '',
            keywords: '',
            value: value,
            comment: '',
            tests: [],
        };
    }
    return oldCustomSample;
}

let oldCustomTest: Test | undefined = undefined;

export function createTest(value: string): Test {
    value = value.trim().replace(/^[/\\]+|[/\\]+$|/g, '');
    if (oldCustomTest === undefined || oldCustomTest.value !== value) {
        oldCustomTest = { value };
    }
    return oldCustomTest;
}

function selectSample(item: ListItem): void {
    let state = getState();
    setState({
        ...state,
        current: { ...state.current, sample: item.value },
    });
}

function selectTest(item: ListItem): void {
    let state = getState();
    setState({
        ...state,
        current: { ...state.current, test: item.value },
    });
}


function collectPlatformsFromField(allowedPlatforms: Set<string>, platforms: string | string[] | undefined) {
    if (!platforms) return;
    if (!Array.isArray(platforms)) {
        platforms = platforms
            .split(/\s+/)
            .filter(x => x);
    }
    for (let platform of platforms) {
        allowedPlatforms.add(platform);
    }
}


const listBoards = cached(function (all: Board[], showNrf: boolean, sample: Sample | undefined, test: Test | undefined): Board[] {
    // Filter nRF only if needed
    if (showNrf) {
        all = all.filter(b => b.value.indexOf('nrf') >= 0);
    } else {
        all = [...all];
    }
    // Collect allowed platforms from current sample and test
    let allowedPlatforms = new Set<string>();
    if (test?.raw) {
        collectPlatformsFromField(allowedPlatforms, test.raw.integration_platforms);
        collectPlatformsFromField(allowedPlatforms, test.raw.platform_allow);
    }
    for (let test of sample?.tests ?? []) {
        if (test?.raw) {
            collectPlatformsFromField(allowedPlatforms, test.raw.integration_platforms);
            collectPlatformsFromField(allowedPlatforms, test.raw.platform_allow);
        }
    }
    // Mark allowed boards
    for (let i = 0; i < all.length; i++) {
        let board = all[i];
        if (allowedPlatforms.has(board.value)) {
            if (!board.icon) all[i] = { ...board, icon: 'star' };
        } else {
            if (board.icon) all[i] = { ...board, icon: undefined };
        }
    }
    // Sort boards
    all.sort((a, b) => {
        if (a.icon && !b.icon) return -1;
        if (!a.icon && b.icon) return 1;
        let aYes = a.value.startsWith('nrf');
        let bYes = b.value.startsWith('nrf');
        if (aYes && !bYes) return -1;
        if (!aYes && bYes) return 1;
        aYes = a.value.indexOf('nrf') >= 0;
        bYes = b.value.indexOf('nrf') >= 0;
        if (aYes && !bYes) return -1;
        if (!aYes && bYes) return 1;
        aYes = a.value.indexOf('@') >= 0;
        bYes = b.value.indexOf('@') >= 0;
        if (aYes && !bYes) return 1;
        if (!aYes && bYes) return -1;
        return a.value.localeCompare(b.value);
    });
    return all;
});

const getCurrentBoard = cached(function (all: Board[], identifier: string): Board {
    let b = all.find(b => b.value === identifier);
    if (b) return b;
    return { value: identifier };
});

function selectBoard(item: ListItem, event?: SyntheticEvent<HTMLElement, Event> | undefined): void {
    let state = getState();
    setState({
        ...state,
        current: { ...state.current, board: item.value },
    });
}

function createBoard(value: string): ListItem | ListItem[] {
    return { value: value.trim() };
}

function App() {
    let state = reloadReactState(React.useState<State>(getState()));
    console.log(state);

    let currentSample = state.sampleList.find(x => x.value === state.current.sample) ?? createSample(state.current.sample);
    let currentTest = currentSample.tests.find(x => x.value === state.current.test) || createTest(state.current.test);
    let boards = listBoards(workspaceBoards, state.showNrfOnly, currentSample, currentTest);
    let currentBoard = getCurrentBoard(workspaceBoards, state.current.board);

    return (<>
        <Card interactive={false} elevation={Elevation.THREE} compact={true}>
            <h3>
                Sample configuration
            </h3>
            <div>
                <FormGroup label="Sample:" labelFor="sample-input" labelInfo={currentSample.description || currentSample.comment}>
                    <SelectListBox
                        items={state.sampleList}
                        selectedItem={currentSample}
                        onItemSelect={selectSample}
                        createNewItemFromQuery={createSample}
                        inputProps={{ id: "sample-input" }}
                    />
                </FormGroup>
                <FormGroup label="Test:" labelFor="test-input">
                    <SelectListBox
                        items={currentSample.tests}
                        selectedItem={currentTest}
                        onItemSelect={selectTest}
                        createNewItemFromQuery={createTest}
                        inputProps={{ id: "test-input" }}
                    />
                </FormGroup>
                <FormGroup label="Board:" labelFor="board-input" labelInfo={currentBoard.details}>
                    <SelectListBox
                        items={boards}
                        selectedItem={currentBoard}
                        onItemSelect={selectBoard}
                        createNewItemFromQuery={createBoard}
                        inputProps={{ id: "board-input" }}
                    />
                </FormGroup>
                <FormGroup label="Extra arguments:" labelFor="args-input">
                    <InputGroup
                        id="args-input"
                        value={state.current.extraArgs}
                        onValueChange={x => setState({ ...state, current: { ...state.current, extraArgs: x } })}
                        rightElement={(<>
                            <Button icon="eraser" minimal={true} text="Clear all" onClick={() => setState({ ...state, current: { ...state.current, extraArgs: '' } })} />
                            <Popover content={<Menu>
                                {state.current.extraArgs.trim() ? (<MenuItem text={`Add to favorites: "${state.current.extraArgs}"`} icon="add" />) : undefined}
                            </Menu>} placement="bottom">
                                <Button
                                    icon="star"
                                    minimal={true}
                                /></Popover></>)}
                    />
                </FormGroup>
                <FormGroup label="Build directory:" labelFor="dir-input">
                    <InputGroup
                        id="dir-input"
                        value={state.current.buildDir}
                        onValueChange={x => setState({ ...state, current: { ...state.current, buildDir: x } })}
                        rightElement={(<>
                            <Button icon="eraser" minimal={true} text="Set to default" onClick={() => setState({ ...state, current: { ...state.current, buildDir: 'build' } })} />
                            <Popover content={<Menu>
                                {state.current.extraArgs.trim() ? (<MenuItem text={`Add to favorites: "${state.current.extraArgs}"`} icon="add" />) : undefined}
                            </Menu>} placement="bottom">
                                <Button
                                    icon="star"
                                    minimal={true}
                                /></Popover></>)}
                    />
                </FormGroup>
            </div>
        </Card>
    </>);
}

async function main() {
    await workspaceInit();
    let state = getState();
    setState({ ...state, sampleList: workspaceSamples });
    let reactContainer = document.querySelector('#reactContainer') as HTMLElement;
    const root = createRoot(reactContainer);
    root.render(<App />);
    //console.log(await request('get.config.read'));
    //console.log(await request('get.read', {file: 'nrf/LICENSE'}));
    //console.log(await request('get.workspace'));
}


window.onload = () => {
    main();
}
