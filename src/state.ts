import { Sample } from "./workspace";



export interface ListItem {
    value: string;
    comment?: string;
    keywords?: string;
    icon?: string;
}


export interface Command {
    name: string;
    template: string;
}

export interface Profile {
    uuid: string;
    name: string;
    sample: string;
    test: string;
    board: string;
    extraArgs: string;
    buildDir: string;
}

export interface State {
    current: Profile;
    profiles: Profile[];
    commands: Command[];
    sampleList: Sample[];
    showNrfOnly: boolean;
}


let curState: State = {
    current: {
        uuid: '',
        name: '',
        sample: '',
        test: '',
        board: '',
        extraArgs: '',
        buildDir: 'build',
    },
    profiles: [],
    commands: [],
    sampleList: [],
    showNrfOnly: true,
};

let tempState: State | undefined = undefined;
let setStateReal: React.Dispatch<React.SetStateAction<State>> | undefined = undefined;

export function setState(state: State) {
    if (!setStateReal) {
        curState = state;
        return;
    } else if (tempState) {
        if (state === tempState) return; // ignore - this is recently set state
    } else {
        if (state === curState) return; // ignore - this is current state
    }
    tempState = state;
    setStateReal(state);
}

export function getState(): State {
    return tempState ? tempState : curState;
}

export function reloadReactState(args: [State, React.Dispatch<React.SetStateAction<State>>]) {
    curState = args[0];
    setStateReal = args[1];
    tempState = undefined;
    return curState;
}
