import { AppStatus, NO_DEVICE_SELECTED, AppEntranceStatus, AppMeetingStatus, AppLobbyStatus } from "../const"
import { MeetingSessionConfiguration, DefaultMeetingSession, DefaultModality } from "amazon-chime-sdk-js"


interface StoreRoster{
    attendeeId     : string,
    baseAttendeeId : string,
    name           : string
}

interface WindowConfig{
    leftBarDisplay    : boolean
    rigntBarDisplay   : boolean
    mainScreenDisplay : boolean
    tileScreenDisplay : boolean
}

export interface MeetingMetadata{
    OwnerId     : string
    PassCode    : string
    Region      : string
    Secret      : boolean
    UsePassCode : boolean
}

export interface MeetingInfo{
    meetingId   : string
    meetingName : string
    metaData    : MeetingMetadata
    meeting     : any |null
}

export interface JoinInfo{
    MeetingName: string
    Attendee:{
        AttendeeId: string
        ExternalUserId: string
        JoinToken: string
    },
    Meeting:{
        MeetingId: string
        MediaRegion: string
        MediaPlacement:{
            AudioFallbackUrl: string
            AudioHostUrl: string
            ScreenDataUrl: string
            ScreenSharingUrl: string
            ScreenViewingUrl: string
            SignalingUrl: string
            TurnControlUrl: string
        }
    }
}

export interface GlobalState {
    counter                           : number
    baseURL                           : string
    userName                          : string
    userId                            : string
    code                              : string

    windowConfig                      : WindowConfig
    meetings                          : MeetingInfo[]
    joinInfo                          : JoinInfo | null





    roomTitle                         : string
    userAttendeeId                    : string
    userBaseAttendeeId                : string
    region                            : string

    meetingSessionConf                : MeetingSessionConfiguration | null
    meetingSession                    : DefaultMeetingSession | null

    inputAudioDevices                 : MediaDeviceInfo[]  | null
    inputVideoDevices                 : MediaDeviceInfo[]  | null
    inputVideoResolutions             : string[]
    outputAudioDevices                : MediaDeviceInfo[] | null
    selectedInputAudioDevice          : string
    selectedInputVideoDevice          : string
    selectedInputVideoResolution      : string
    selectedOutputAudioDevice         : string

    storeRoster                       : {[attendeeId:string]:StoreRoster}

    status                            : AppStatus
    entranceStatus                    : AppEntranceStatus
    meetingStatus                     : AppMeetingStatus
    lobbyStatus                       : AppLobbyStatus
}

export const initialState = {
    counter                             : 0,
    baseURL                             : "",
    userName                            : "",
    userId                              : "",
    code                                : "",

    windowConfig                        : 
        {
            leftBarDisplay    : true,
            rigntBarDisplay   : true,
            mainScreenDisplay : true,
            tileScreenDisplay : true,
        },
    meetings                            : [],

    roomTitle                           : "",
    userAttendeeId                      : "",
    userBaseAttendeeId                  : "",
    region                              : "",

    joinInfo                            : null,
    meetingSessionConf                  : null,
    meetingSession                      : null,

    inputAudioDevices                   : null,
    inputVideoDevices                   : null,
    inputVideoResolutions               : ["360p", "540p", "720p"],
    outputAudioDevices                  : null,
    selectedInputAudioDevice            : NO_DEVICE_SELECTED,
    selectedInputVideoResolution        : NO_DEVICE_SELECTED,
    selectedInputVideoDevice            : NO_DEVICE_SELECTED,
    selectedOutputAudioDevice           : NO_DEVICE_SELECTED,


    storeRoster                         : {},

    status                              : AppStatus.STARTED,
    entranceStatus                             : AppEntranceStatus.NONE,
    meetingStatus                       : AppMeetingStatus.NONE,
    lobbyStatus                         : AppLobbyStatus.NONE,
}


const reducer = (state: GlobalState = initialState, action: any) => {
    var gs: GlobalState = Object.assign({}, state)
    gs.counter++
    console.log(state, action)
    let tmp:any
    switch (action.type) {
        case 'INITIALIZE':
            gs = initialState
            break
        case 'GO_ENTRANCE':
            gs.status = AppStatus.IN_ENTRANCE
            gs.entranceStatus = AppEntranceStatus.NONE
            gs.baseURL = action.payload
            break
        case 'USER_CREATED':
            gs.entranceStatus  = AppEntranceStatus.USER_CREATED
            gs.userName  = action.payload[0]
            gs.userId    = action.payload[1]
            gs.code      = action.payload[2]
            break

        case 'LOGIN':
            gs.entranceStatus  = AppEntranceStatus.EXEC_LOGIN // avoid looping
            break

        case 'USER_LOGINED':
            gs.status   = AppStatus.IN_LOBBY
            gs.entranceStatus  = AppEntranceStatus.NONE
            gs.lobbyStatus = AppLobbyStatus.WILL_PREPARE
            gs.userName  = action.payload[0]
            gs.userId    = action.payload[1]
            gs.code      = action.payload[2]
            break
        case 'LOBBY_PREPARED':
            gs.lobbyStatus = AppLobbyStatus.DONE_PREPARE
            gs.inputAudioDevices = action.payload[0]
            gs.inputVideoDevices = action.payload[1]
            gs.outputAudioDevices = action.payload[2]
            gs.selectedInputAudioDevice      = gs.inputAudioDevices![0]     ? gs.inputAudioDevices![0]['deviceId']     : NO_DEVICE_SELECTED
            gs.selectedInputVideoDevice      = gs.inputVideoDevices![0]     ? gs.inputVideoDevices![0]['deviceId']     : NO_DEVICE_SELECTED
            gs.selectedInputVideoResolution  = gs.inputVideoResolutions![0] ? gs.inputVideoResolutions![0]             : NO_DEVICE_SELECTED
            gs.selectedOutputAudioDevice     = gs.outputAudioDevices![0]    ? gs.outputAudioDevices![0]['deviceId']    : NO_DEVICE_SELECTED
            break
    

        case 'GOT_ALL_ROOM_LIST':
            tmp = action.payload[0]
            console.log(tmp)
            gs.meetings = tmp.map((meeting:any)=>{
                console.log("-->", meeting.MeetingId)
                return {
                    meetingId   : meeting.MeetingId,
                    meetingName : meeting.MeetingName,
                    metaData    : meeting.Metadata,
                    meeting     : meeting.MeetingInfo.Meeting,
                }
            })
            console.log(gs)
            break

        case 'JOINED_MEETING':
            gs.status        = AppStatus.IN_MEETING
            gs.meetingStatus = AppMeetingStatus.WILL_PREPARE
            gs.joinInfo      = action.payload[0] as JoinInfo
            break

        case 'LEFT_MEETING':
            gs.status        = AppStatus.IN_MEETING
            gs.meetingStatus = AppMeetingStatus.WILL_CLEAR
            // gs.joinInfo      = 
            break
    


        case 'MEETING_PREPARED':
            gs.status        = AppStatus.IN_MEETING
            gs.meetingStatus      = AppMeetingStatus.DONE_PREPARE
            gs.meetingSessionConf = action.payload[0]
            gs.meetingSession     = action.payload[1]
            break

        case 'CLEARED_MEETING_SESSION':
            gs.status        = AppStatus.IN_LOBBY
            gs.meetingStatus = AppMeetingStatus.NONE
            gs.meetingSessionConf = null
            gs.meetingSession     = null
            gs.joinInfo = null
            break
        
        case 'CREATE_MEETING_ROOM':
            //SAGA
            break
        // case 'CREATED_MEETING_ROOM':
        //     gs.status = AppStatus.CREATED_MEETING_ROOM
        //     gs.baseURL = action.payload[0]
        //     gs.roomTitle = action.payload[1]
        //     gs.userName = action.payload[2]
        //     gs.region = action.payload[3]
        //     gs.joinInfo = action.payload[4]
        //     break
        // case 'ENTER_SESSION':
        //     gs.status = AppStatus.ENTERING_SESSION
        //     console.log('enter session (do nothing)')
        //     break
        // case 'JOIN':
        //     gs.status = AppStatus.SELECT_DEVICE
        //     gs.baseURL = action.payload[0]
        //     gs.roomTitle = action.payload[1]
        //     gs.userName = action.payload[2]
        //     gs.region = action.payload[3]
        //     gs.joinInfo = action.payload[4]
        //     gs.userAttendeeId   = action.payload[4].Attendee.AttendeeId
        //     gs.userBaseAttendeeId = encodeURIComponent(new DefaultModality(gs.userAttendeeId).base());

        //     break

        // case 'INITIALIZED_SESSION':
        //     gs.meetingSessionConf = action.payload[0]
        //     gs.meetingSession = action.payload[1]
        //     break

        // case 'SET_DEVICES':
        //     gs.inputAudioDevices = action.payload[0]
        //     gs.inputVideoDevices = action.payload[1]
        //     gs.inputVideoResolutions = action.payload[2]
        //     gs.outputAudioDevices = action.payload[3]
        //     gs.selectedInputAudioDevice      = gs.inputAudioDevices![0]     ? gs.inputAudioDevices![0]['deviceId']  : NO_DEVICE_SELECTED
        //     gs.selectedInputVideoDevice      = gs.inputVideoDevices![0]     ? gs.inputVideoDevices![0]['deviceId']  : NO_DEVICE_SELECTED
        //     gs.selectedInputVideoResolution  = gs.inputVideoResolutions![0] ? gs.inputVideoResolutions![0]          : NO_DEVICE_SELECTED
        //     gs.selectedOutputAudioDevice     = gs.outputAudioDevices![0]    ? gs.outputAudioDevices![0]['deviceId'] : NO_DEVICE_SELECTED
        //     break
        

        // case 'SELECT_INPUT_AUDIO_DEVICE':
        //     gs.selectedInputAudioDevice = action.payload
        //     break
                        
        // case 'SELECT_INPUT_VIDEO_DEVICE':
        //     gs.selectedInputVideoDevice = action.payload
        //     break
        // case 'SELECT_INPUT_VIDEO_RESOLUTION':
        //     gs.selectedInputVideoResolution = action.payload
        //     break

        // case 'SELECT_OUTPUT_AUDIO_DEVICE':
        //     gs.selectedOutputAudioDevice = action.payload
        //     break

        // case 'START_MEETING':
        //     gs.status = AppStatus.IN_MEETING_ROOM
        //     break
        // case 'LEAVE_MEETING':
        //     gs = initialState
        //     break

        // case 'UPDATE_ATTENDEE_INFORMATION':
        //     const attendeeId = action.payload[0]
        //     const baseAttendeeId = action.payload[1]
        //     const name = action.payload[2]
        //     gs.storeRoster[attendeeId] = {
        //         attendeeId : attendeeId,
        //         baseAttendeeId :baseAttendeeId,
        //         name:name
        //     }
        //     break


    }
    return gs
}

export default reducer;
