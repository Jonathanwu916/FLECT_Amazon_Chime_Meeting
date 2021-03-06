import * as React from 'react';
import { GlobalState } from '../reducers';
import { AppStatus, LOGGER_BATCH_SIZE, LOGGER_INTERVAL_MS, AppEntranceStatus, AppMeetingStatus, AppLobbyStatus, NO_DEVICE_SELECTED, LocalVideoConfigs, NO_FOCUSED } from '../const';

import {
    ConsoleLogger,
    DefaultDeviceController,
    DefaultMeetingSession,
    LogLevel,
    MeetingSessionConfiguration,
    Logger,
    MeetingSessionPOSTLogger,
    VideoTileState,
    DataMessage,
    MeetingSession,
} from 'amazon-chime-sdk-js';
import Entrance from './Entrance';
import Lobby from './Lobby';
import DeviceChangeObserverImpl from './DeviceChangeObserverImpl';
import AudioVideoObserverImpl from './AudioVideoObserverImpl';
import ContentShareObserverImpl from './ContentShareObserverImpl';
import { setRealtimeSubscribeToAttendeeIdPresence, setSubscribeToActiveSpeakerDetector, setRealtimeSubscribeToReceiveDataMessage } from './subscribers';
import { getDeviceLists, getTileId, getAudioDevice } from './utils'
import { API_BASE_URL } from '../config';
import { RS_STAMPS } from './resources';
import ErrorPortal from './meetingComp/ErrorPortal';
import { saveFile, RecievingStatus, SendingStatus, getSendingStatus, getRecievingStatus } from './WebsocketApps/FileTransfer';
import {  WSMessageType } from './WebsocketApps/const';
import {  WSStamp } from './WebsocketApps/Stamp';
import { WSText } from './WebsocketApps/Text';
import { sendStampBySignal } from './WebsocketApps/StampBySignal';
import { sendDrawingBySignal, DrawingType, WSDrawing } from './WebsocketApps/DrawingBySignal'
import { WebsocketApps } from './WebsocketApps/WebsocketApps'
import { LocalVideoEffectors } from 'local-video-effector'


/**
 * 
 * @param meetingSessionConf 
 */
const initializeMeetingSession = (gs: GlobalState, meetingSessionConf: MeetingSessionConfiguration): DefaultMeetingSession => {

    let logger: Logger;
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        logger = new ConsoleLogger('SDK', LogLevel.WARN);
    } else {
        logger = new MeetingSessionPOSTLogger(
            'SDK',
            meetingSessionConf,
            LOGGER_BATCH_SIZE,
            LOGGER_INTERVAL_MS,
            `${API_BASE_URL}logs`,
            LogLevel.WARN
        );
    }
    const deviceController = new DefaultDeviceController(logger);
    meetingSessionConf.enableWebAudio = false;
    meetingSessionConf.enableUnifiedPlanForChromiumBasedBrowsers = true

    const meetingSession = new DefaultMeetingSession(meetingSessionConf, logger, deviceController);
    return meetingSession
}


/**
 * 
 * @param app 
 * @param props 
 * @param meetingSession 
 */
const registerHandlers = (app: App, props: any, meetingSession: DefaultMeetingSession) => {
    const meetingId = meetingSession.configuration.meetingId
    meetingSession.audioVideo.addDeviceChangeObserver(new DeviceChangeObserverImpl(meetingId!, app, props));
    meetingSession.audioVideo.setDeviceLabelTrigger(
        async (): Promise<MediaStream> => {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
            console.log("setDeviceLabelTrigger")
            return stream;
        }
    );
    meetingSession.audioVideo.realtimeSubscribeToMuteAndUnmuteLocalAudio((isMuted: boolean): void => {
        console.log(`muted = ${isMuted}`);
    })

    meetingSession.audioVideo.realtimeSubscribeToSetCanUnmuteLocalAudio((canUnmute: boolean): void => {
        console.log(`canUnmute = ${canUnmute}`);
    })

    meetingSession.audioVideo.addObserver(new AudioVideoObserverImpl(meetingId!, app));
    meetingSession.audioVideo.addContentShareObserver(new ContentShareObserverImpl(meetingId!, app, props));

    setRealtimeSubscribeToAttendeeIdPresence(meetingId!, app, meetingSession.audioVideo)
    setSubscribeToActiveSpeakerDetector(meetingId!, app, meetingSession.audioVideo)
    setRealtimeSubscribeToReceiveDataMessage(meetingId!, app, meetingSession.audioVideo, WSMessageType.Drawing)
    setRealtimeSubscribeToReceiveDataMessage(meetingId!, app, meetingSession.audioVideo, WSMessageType.Stamp)
    setRealtimeSubscribeToReceiveDataMessage(meetingId!, app, meetingSession.audioVideo, WSMessageType.Text)

}

let dataMessageConsumers:any[] = []
export const addDataMessageConsumers = (consumer:any) =>{
    dataMessageConsumers.push(consumer)
}
export const removeDataMessageConsumers = (consumer:any) =>{
    dataMessageConsumers = dataMessageConsumers.filter(n => n !== consumer)
}

/**
 * 
 */
export interface Attendee {
    attendeeId: string
    name: string | null
    active: boolean
    volume: number
    muted: boolean
    paused: boolean
    signalStrength: number
}

export interface FileTransferStatus{
    sendingStatusStatuses  : SendingStatus[]
    recievingStatuses      : RecievingStatus[] 

}

export interface CurrentSettings {
    mute: boolean,
    videoEnable: boolean,
    speakerEnable: boolean,
    selectedInputAudioDevice: string
    selectedInputVideoDevice: string
    selectedInputVideoResolution: string
    selectedOutputAudioDevice: string

    selectedInputVideoDevice2: string
}


export interface JoinedMeeting{
    roster: { [attendeeId: string]: Attendee }
    videoTileStates: { [id: number]: VideoTileState }
    fileTransferStatus       : FileTransferStatus
    globalStamps: (WSStamp|WSText)[]
    focusAttendeeId: string
    messagingSocket: WebsocketApps,
    meetingSessionConfiguration: MeetingSessionConfiguration,
    meetingSession: MeetingSession,
    outputAudioElement: HTMLAudioElement | null,
}



/**
 * 
 */
export interface AppState {
    joinedMeetings : {[id:string]:JoinedMeeting},
    focusedMeeting : string,

    stamps: { [key: string]: HTMLImageElement },
    shareVideoElement: HTMLVideoElement,

    currentSettings: CurrentSettings,
    localVideoEffectors: LocalVideoEffectors,
}

/**
 * Main Component
 */
class App extends React.Component {

    state: AppState = {
        joinedMeetings: {},
        focusedMeeting: NO_FOCUSED,
        stamps: {},

        shareVideoElement: document.createElement("video"),


        currentSettings: {
            mute: false,
            videoEnable: true,
            speakerEnable: true,
            selectedInputAudioDevice: NO_DEVICE_SELECTED,
            selectedInputVideoDevice: NO_DEVICE_SELECTED,
//            selectedInputVideoResolution: "vc720p",
            selectedInputVideoResolution: "vc180p3",
            selectedOutputAudioDevice: NO_DEVICE_SELECTED,

            selectedInputVideoDevice2: NO_DEVICE_SELECTED,
        },
        localVideoEffectors : new LocalVideoEffectors(null)
    }


    /***************************
    *  Callback for tile change
    ****************************/
    updateVideoTileState = (meetingId:string, state: VideoTileState) => {
        let needUpdate = false
        if(this.state.joinedMeetings[meetingId]!==undefined){
            const videoTileStates = this.state.joinedMeetings[meetingId].videoTileStates
            if (videoTileStates[state.tileId!]) {
            } else {
                needUpdate = true
            }
            videoTileStates[state.tileId!] = state
            if (needUpdate) {
                this.setState({videoTileStates:videoTileStates})
            }
            console.log("updateVideoTileState ", state.tileId!)
            console.log("updateVideoTileState ", this.state.joinedMeetings[meetingId].videoTileStates)
        }
    }
    removeVideoTileState = (meetingId:string, tileId: number) => {
        if(this.state.joinedMeetings[meetingId]!==undefined){
            delete this.state.joinedMeetings[meetingId].videoTileStates[tileId]
            this.setState({})
            console.log("removeVideoTileState ", tileId)
        }
    }
    /***************************
    *  Callback for attendee change
    ****************************/
    deleteAttendee = (meetingId:string, attendeeId: string) => {
        console.log("deleteAttendee")
        if(this.state.joinedMeetings[meetingId] !== undefined){
            const joinedMeetings = this.state.joinedMeetings
            delete joinedMeetings[meetingId].roster[attendeeId]
            this.setState({joinedMeetings:joinedMeetings})
        }
    }

    changeAttendeeStatus = (meetingId:string, attendeeId: string, volume: number | null, muted: boolean | null, signalStrength: number | null) => {
        // console.log("changeAttendeeStatus", attendeeId)
        const props = this.props as any
        if(this.state.joinedMeetings[meetingId] !== undefined){
            const joinedMeetings = this.state.joinedMeetings
            const roster = joinedMeetings[meetingId].roster
            if ((attendeeId in roster) === false) {
                roster[attendeeId] = {
                    attendeeId: attendeeId,
                    name: null,
                    active: false,
                    volume: 0,
                    muted: false,
                    paused: false,
                    signalStrength: 0
                }
            }
            
    
            if (volume !== null) {
                roster[attendeeId].volume = volume
            }
            if (muted !== null) {
                roster[attendeeId].muted = muted
            }
            if (signalStrength !== null) {
                roster[attendeeId].signalStrength = signalStrength
            }
            if (this.state.joinedMeetings[meetingId].roster[attendeeId].name === null || this.state.joinedMeetings[meetingId].roster[attendeeId].name === "Unknown") { // ChimeがUnknownで返すときがある
                props.getAttendeeInformation(meetingId, attendeeId)
            }
            this.setState({joinedMeetings:joinedMeetings})
        }
    }

    changeActiveSpeaker = (meeting:string, attendeeId: string) => {
        //console.log("changeActiveSpeaker")
        // const props = this.props as any
        //props.changeActiveSpeaker(attendeeId)
    }
    updateActiveScore = (meeting:string, scores: { [attendeeId: string]: number }) => {
        // const props = this.props as any
        //console.log("updateActiveScore")
        //props.updateActiveScore(scores)
    }
    /***************************
    *  Callback for DataMessage
    ****************************/
    receivedDataMessage = (meetingId:string, dataMessage: DataMessage) =>{
        console.log("recieving data!!!!!")
        if(dataMessage.topic === WSMessageType.Text){

        }else if(dataMessage.topic === WSMessageType.Stamp){
            const json = JSON.parse(Buffer.from(dataMessage.data).toString())
            const stamp = json.content as WSStamp
            this.state.joinedMeetings[meetingId].globalStamps.push(stamp)

        }else if(dataMessage.topic === WSMessageType.Drawing){
            const json = JSON.parse(Buffer.from(dataMessage.data).toString())
            const data = json.content as WSDrawing
            console.log(data)
            dataMessageConsumers.map(consumer =>{
                if(data.mode === DrawingType.Draw){
                    consumer.draw(data.startXR, data.startYR, data.endXR, data.endYR, data.stroke, data.lineWidth, true)
                }else if(data.mode === DrawingType.Erase){
                    consumer.erase(data.startXR, data.startYR, data.endXR, data.endYR, true)
                }else if(data.mode === DrawingType.Clear){
                    consumer.clearDrawing()
                }else{
                    console.log("CMD3",data.mode, DrawingType.Erase.toString())
                }
                return ""
            })
        }
    }

    ////////////////////////////////
    /// User Action
    ///////////////////////////////
    // For Microphone
    toggleMute = () => {

        const mute = !this.state.currentSettings.mute
        const currentSettings = this.state.currentSettings
        currentSettings.mute = mute

        if(mute){
            Object.keys(this.state.joinedMeetings).forEach((x:string)=>{
                this.state.joinedMeetings[x].meetingSession.audioVideo.realtimeMuteLocalAudio();
            })
        }else{
            Object.keys(this.state.joinedMeetings).forEach((x:string)=>{
                this.state.joinedMeetings[x].meetingSession.audioVideo.realtimeUnmuteLocalAudio();
            })
        }
        this.setState({ currentSettings: currentSettings })
    }

    selectInputAudioDevice = (deviceId: string) => {
        const currentSettings = this.state.currentSettings
        currentSettings.selectedInputAudioDevice = deviceId

        Object.keys(this.state.joinedMeetings).forEach((x:string)=>{
            this.state.joinedMeetings[x].meetingSession.audioVideo.chooseAudioInputDevice(deviceId);
        })
        this.setState({ currentSettings: currentSettings })
    }

    // For Camera
    toggleVideo = () => {
        const videoEnable = !this.state.currentSettings.videoEnable
        const currentSettings = this.state.currentSettings
        currentSettings.videoEnable = videoEnable
        const localVideoEffectors = this.state.localVideoEffectors
        localVideoEffectors.cameraEnabled=videoEnable
        this.setState({ currentSettings: currentSettings, localVideoEffectors:localVideoEffectors})
        if (videoEnable && currentSettings.selectedInputVideoDevice !== NO_DEVICE_SELECTED) {
            this.selectInputVideoDevice(currentSettings.selectedInputVideoDevice)
        } else {
            Object.keys(this.state.joinedMeetings).forEach((x:string)=>{
                this.state.joinedMeetings[x].meetingSession.audioVideo.chooseVideoInputDevice(null)
                this.state.joinedMeetings[x].meetingSession.audioVideo.stopLocalVideoTile()
            })
            this.state.localVideoEffectors.stopInputMediaStream()
        }
    }

    selectInputVideoDevice = (deviceId: string) => {
        console.log("SELECT INPUTDEVICE", deviceId)
        const inputPromises = []
        Object.keys(this.state.joinedMeetings).forEach((x:string)=>{
            inputPromises.push(this.state.joinedMeetings[x].meetingSession.audioVideo.chooseVideoInputDevice(null))
        })
        const localVideoEffectorsPromise = this.state.localVideoEffectors.selectInputVideoDevice(deviceId)
        inputPromises.push(localVideoEffectorsPromise)

        Promise.all(inputPromises).then(()=>{
            const mediaStream = this.state.localVideoEffectors.getMediaStream()
            Object.keys(this.state.joinedMeetings).forEach((x:string)=>{
                this.state.joinedMeetings[x].meetingSession.audioVideo.chooseVideoInputDevice(mediaStream).then(()=>{
                    this.state.joinedMeetings[x].meetingSession.audioVideo.startLocalVideoTile()
                })
            })
        })
        const currentSettings = this.state.currentSettings
        currentSettings.selectedInputVideoDevice = deviceId
        this.setState({ currentSettings: currentSettings })
    }

    selectInputVideoDevice2 = (deviceId: string) => {
        const currentSettings = this.state.currentSettings
        currentSettings.selectedInputVideoDevice2 = deviceId
        this.setState({ currentSettings: currentSettings })
    }    

    // For mediastream
    dummyVideoElement = document.createElement("video")
    setSelectedVideo = (e:any) =>{
        const videoPromises = []
        Object.keys(this.state.joinedMeetings).forEach((x:string)=>{
            videoPromises.push(this.state.joinedMeetings[x].meetingSession.audioVideo.chooseVideoInputDevice(null))
        })

        const blob = e.target.files[0] as Blob
        const obj_url = URL.createObjectURL(blob);

        this.dummyVideoElement.width=100
        this.dummyVideoElement.height=100
        
        this.dummyVideoElement.loop=true
        this.dummyVideoElement.autoplay=true
        this.dummyVideoElement.src = obj_url
        this.dummyVideoElement.play()
        // @ts-ignore
        const mediaStream = this.dummyVideoElement.captureStream() as MediaStream
        console.log(mediaStream)
        const localVideoEffectorsPromise = this.state.localVideoEffectors.setMediaStream(mediaStream)
        videoPromises.push(localVideoEffectorsPromise)

        Promise.all(videoPromises).then(()=>{
            const mediaStream = this.state.localVideoEffectors.getMediaStream()
            Object.keys(this.state.joinedMeetings).forEach((x:string)=>{
                videoPromises.push(this.state.joinedMeetings[x].meetingSession.audioVideo.chooseVideoInputDevice(null))
                this.state.joinedMeetings[x].meetingSession?.audioVideo.chooseVideoInputDevice(mediaStream).then(()=>{
                    this.state.joinedMeetings[x].meetingSession!.audioVideo.startLocalVideoTile()
                })
            })
        })
        const currentSettings = this.state.currentSettings
        this.setState({ currentSettings: currentSettings })
    }

    // For Speaker
    toggleSpeaker = () => {

        const speakerEnable = !this.state.currentSettings.speakerEnable
        if (speakerEnable) {
            Object.keys(this.state.joinedMeetings).forEach((x:string)=>{
                this.state.joinedMeetings[x].meetingSession!.audioVideo.bindAudioElement(this.state.joinedMeetings[x].outputAudioElement!)
            })
        } else {
            Object.keys(this.state.joinedMeetings).forEach((x:string)=>{
                this.state.joinedMeetings[x].meetingSession!.audioVideo.unbindAudioElement();
            })
        }

        const currentSettings = this.state.currentSettings
        currentSettings.speakerEnable = speakerEnable
        this.setState({ currentSettings: currentSettings })
    }

    selectOutputAudioDevice = (deviceId: string) => {
        Object.keys(this.state.joinedMeetings).forEach((x:string)=>{
            this.state.joinedMeetings[x].meetingSession!.audioVideo.chooseAudioOutputDevice(deviceId)
        })        
        const currentSettings = this.state.currentSettings
        currentSettings.selectedOutputAudioDevice = deviceId
        this.setState({ currentSettings: currentSettings })
    }

    // For SharedVideo
    sharedVideoSelected = (e: any) => {
        const path = URL.createObjectURL(e.target.files[0]);

        try {
            Object.keys(this.state.joinedMeetings).forEach((x:string)=>{
                this.state.joinedMeetings[x].meetingSession!.audioVideo.stopContentShare()
            })        
            this.state.shareVideoElement.pause()
        } catch (e) {
        }
        const videoElement = this.state.shareVideoElement
        videoElement.src = path
        videoElement.play()

        setTimeout(
            async () => {
                // @ts-ignore
                const mediaStream: MediaStream = await this.state.shareVideoElement.captureStream()
                Object.keys(this.state.joinedMeetings).map(async (x:string)=>{
                    this.state.joinedMeetings[x].meetingSession!.audioVideo.stopContentShare()
                    await this.state.joinedMeetings[x].meetingSession!.audioVideo.startContentShare(mediaStream)
                })
                    
                // 要確認。asyncの中に入れたほうがいいか？2020/6/30
                videoElement.currentTime = 0
                videoElement.pause()
                this.setState({shareVideoElement: videoElement})
            }
            , 5000); // I don't know but we need some seconds to restart video share....
    }

    playSharedVideo = () => {
        this.state.shareVideoElement.play()
    }
    pauseSharedVideo = () => {
        this.state.shareVideoElement.pause()
    }
    stopSharedVideo = () => {
        Object.keys(this.state.joinedMeetings).forEach((x:string)=>{
            this.state.joinedMeetings[x].meetingSession!.audioVideo.stopContentShare()
        })      
    }
    // For SharedDisplay
    sharedDisplaySelected = () => {
        //gs.meetingSession!.audioVideo.startContentShareFromScreenCapture()
        const streamConstraints = {
            frameRate: {
                max: 15,
            },
        }
        // @ts-ignore https://github.com/microsoft/TypeScript/issues/31821
        navigator.mediaDevices.getDisplayMedia(streamConstraints).then(media => {
            Object.keys(this.state.joinedMeetings).forEach((x:string)=>{
                this.state.joinedMeetings[x].meetingSession!.audioVideo.startContentShare(media)
            })      
        })
    }
    stopSharedDisplay = () => {
        Object.keys(this.state.joinedMeetings).forEach((x:string)=>{
            this.state.joinedMeetings[x].meetingSession!.audioVideo.stopContentShare()
        })      
    }

    // For Config
    setVirtualBackground = (imgPath: string) => {
        console.log("SetVirtual", imgPath) 
        const localVideoEffectors = this.state.localVideoEffectors
        localVideoEffectors.virtualBackgroundImagePath = imgPath
        if(imgPath === "/resources/vbg/pic0.jpg"){
            localVideoEffectors.virtualBackgroundEnabled   = false
        }else{
            localVideoEffectors.virtualBackgroundEnabled   = true
        }
        this.setState({ localVideoEffectors:localVideoEffectors })
    }

    selectInputVideoResolution = (value: string) =>{

        const videoConfig = LocalVideoConfigs[value]
        //console.log(videoConfig)
        Object.keys(this.state.joinedMeetings).forEach((x:string)=>{
            this.state.joinedMeetings[x].meetingSession!.audioVideo.chooseVideoInputQuality(videoConfig.width, videoConfig.height, videoConfig.frameRate, videoConfig.maxBandwidthKbps);
        })      
        const currentSettings = this.state.currentSettings
        currentSettings.selectedInputVideoResolution = value
        this.setState({ currentSettings: currentSettings })

        const videoEnable = this.state.currentSettings.videoEnable
        if (videoEnable) {
            this.selectInputVideoDevice(currentSettings.selectedInputVideoDevice)
        }         
    }

    // For TileView Control
    setFocusedAttendee = (meetingId:string, attendeeId: string) => {
        console.log("focus:", this.state.joinedMeetings[meetingId].focusAttendeeId)
        // if(attendeeId === gs.joinInfo?.Attendee.AttendeeId && this.state.currentSettings.videoEnable === false){
        //     console.log("local video is off")
        //     return
        // }
        const joinedMeetings = this.state.joinedMeetings
        joinedMeetings[meetingId].focusAttendeeId = attendeeId        
        this.setState({ 
            focusedMeeting: meetingId,
            joinedMeetings: joinedMeetings 
        })
    }
    
    pauseVideoTile = (meetingId:string, attendeeId:string) =>{
        const tileId = getTileId(attendeeId, this.state.joinedMeetings[meetingId].videoTileStates)
        if(tileId >= 0){
            this.state.joinedMeetings[meetingId].meetingSession.audioVideo.pauseVideoTile(tileId)
            const joinedMeetings = this.state.joinedMeetings
            joinedMeetings[meetingId].roster[attendeeId].paused = true
            this.setState({joinedMeetings:joinedMeetings})
        }else{
            console.log("There is no tile: ", tileId, attendeeId)
        }
    }
    unpauseVideoTile = (meetingId:string, attendeeId:string) =>{
        const tileId = getTileId(attendeeId, this.state.joinedMeetings[meetingId].videoTileStates)
        if(tileId >= 0){
            this.state.joinedMeetings[meetingId].meetingSession.audioVideo.unpauseVideoTile(tileId)
            const joinedMeetings = this.state.joinedMeetings
            joinedMeetings[meetingId].roster[attendeeId].paused = false
            this.setState({joinedMeetings:joinedMeetings})
        }else{
            console.log("There is no tile: ", tileId, attendeeId)
        }
    }


    // For Messaging
    sendStamp = (meetingId:string, targetId: string, imgPath: string) => {
        console.log("sendstamp1 ", meetingId)
        console.log("sendstamp2 ", this.state.joinedMeetings)
        this.state.joinedMeetings[meetingId].messagingSocket!.sendStamp(targetId, imgPath)
    }

    sendStampBySignal = (meetingId:string, targetId: string, imgPath: string) => {
        Object.keys(this.state.joinedMeetings).forEach((x:string)=>{
            sendStampBySignal(this.state.joinedMeetings[x].meetingSession!.audioVideo, targetId, imgPath, false)
        })
    }

    sendText = (meetingId:string, targetId: string, text: string) => {
        this.state.joinedMeetings[meetingId].messagingSocket!.sendText(targetId, text)
    }

    sendDrawingBySignal = (meetingId:string, targetId: string, mode:string, startXR:number, startYR:number, endXR:number, endYR:number, stroke:string, lineWidth:number)=>{
        Object.keys(this.state.joinedMeetings).forEach((x:string)=>{
            sendDrawingBySignal(this.state.joinedMeetings[x].meetingSession!.audioVideo, targetId, mode, startXR, startYR, endXR, endYR, stroke, lineWidth, false)
        })
    }

    // For File Share
    sharedFileSelected = (meetingId:string, targetId:string, e: any) => {
        this.state.joinedMeetings[meetingId].messagingSocket!.startFileTransfer(targetId, e)
    }

    // For Lobby
    joinMeeting = (meetingId:string, gs:GlobalState) =>{
        const props = this.props as any
        if(this.state.joinedMeetings[meetingId]===undefined){
            props.joinMeeting(meetingId, gs)
        }else{
            console.log("Already joined!")
        }
    }

    leaveMeeting = (meetingId:string, attendeeId:string) =>{
        const props = this.props as any
        props.leaveMeeting(meetingId, attendeeId)

        // Just left meeting. post process
        if(this.state.joinedMeetings[meetingId] !== undefined){
            this.state.joinedMeetings[meetingId].meetingSession.audioVideo.stopLocalVideoTile()
            this.state.joinedMeetings[meetingId].meetingSession.audioVideo.unbindAudioElement()
            for (let key in this.state.joinedMeetings[meetingId].videoTileStates) {
                this.state.joinedMeetings[meetingId].meetingSession.audioVideo.unbindVideoElement(Number(key))
            }
            this.state.joinedMeetings[meetingId].meetingSession.audioVideo.stop()
            if(this.state.focusedMeeting === meetingId){
                this.setState({focusedMeeting: NO_FOCUSED})
            }
            const joinedMeetings = this.state.joinedMeetings
            delete joinedMeetings[meetingId]
            this.setState({joinedMeetings:joinedMeetings})
        }
        props.clearedMeetingSession(meetingId)
    }


    callbacks: { [key: string]: any } = {
        toggleMute: this.toggleMute,
        selectInputAudioDevice: this.selectInputAudioDevice,
        toggleVideo: this.toggleVideo,
        selectInputVideoDevice: this.selectInputVideoDevice,
        toggleSpeaker: this.toggleSpeaker,
        selectOutputAudioDevice: this.selectOutputAudioDevice,
        selectInputVideoResolution: this.selectInputVideoResolution,
        setSelectedVideo: this.setSelectedVideo,

        sharedVideoSelected: this.sharedVideoSelected,
        playSharedVideo: this.playSharedVideo,
        pauseSharedVideo: this.pauseSharedVideo,
        stopSharedVideo:  this.stopSharedVideo,
        sharedDisplaySelected: this.sharedDisplaySelected,
        stopSharedDisplay: this.stopSharedDisplay,
        setVirtualBackground: this.setVirtualBackground,
        setFocusedAttendee: this.setFocusedAttendee,
        pauseVideoTile: this.pauseVideoTile,
        unpauseVideoTile: this.unpauseVideoTile,
        sendStamp: this.sendStamp,
        sendText: this.sendText,

        // addMessagingConsumer: this.addMessagingConsumer,
        selectInputVideoDevice2: this.selectInputVideoDevice2,
        sendStampBySignal: this.sendStampBySignal,
        sendDrawingBySignal: this.sendDrawingBySignal,
        sharedFileSelected: this.sharedFileSelected,
        
        _joinMeeting:  this.joinMeeting,
        _leaveMeeting: this.leaveMeeting,

    }


    componentDidMount() {
        requestAnimationFrame(() => this.drawVideoCanvas())
    }


    drawVideoCanvas = () => {
        this.state.localVideoEffectors.doEffect(
            LocalVideoConfigs[this.state.currentSettings.selectedInputVideoResolution].width,
            LocalVideoConfigs[this.state.currentSettings.selectedInputVideoResolution].height)
        requestAnimationFrame(() => this.drawVideoCanvas())
    }




    render() {
        const gs = this.props as GlobalState
        const props = this.props as any
        const bgColor = "#eeeeee"
        for (let key in this.callbacks) {
            props[key] = this.callbacks[key]
        }

        if(gs.showError === true){
            return <ErrorPortal {...props}/>
        }

        /**
         * For Started
         */
        if (gs.status === AppStatus.STARTED) {
            const base_url: string = [window.location.protocol, '//', window.location.host, window.location.pathname.replace(/\/*$/, '/').replace('/v2', '')].join('');
            // this.setState({

            //     roster          : {},
            //     videoTileStates : {},
            // })
            props.goEntrance(base_url)
            return <div />
        }
        /**
         * For Entrance
         */
        if (gs.status === AppStatus.IN_ENTRANCE) {
            // show screen
            if (gs.entranceStatus === AppEntranceStatus.NONE) {
                return (
                    <div style={{ backgroundColor: bgColor, width: "100%", height: "100%", top: 0, left: 0, }}>
                        <Entrance {...props} />
                    </div>
                )
            } else if (gs.entranceStatus === AppEntranceStatus.USER_CREATED) {
                // User Created
                props.login(gs.userName, gs.code)
                return <div> executing... </div>
            }
        }

        /**
         * For Lobby
         */
        if (gs.status === AppStatus.IN_LOBBY) {
            if (gs.lobbyStatus === AppLobbyStatus.WILL_PREPARE) {
//                const netPromise = bodyPix.load();
                // Load Stamps
                const RS_STAMPS_sorted = RS_STAMPS.sort()
                const stamps: { [key: string]: HTMLImageElement } ={}
                for (const i in RS_STAMPS_sorted) {
                    const imgPath = RS_STAMPS_sorted[i]
                    const image = new Image()
                    image.src = imgPath
                    image.onload = () => {
                        stamps[imgPath] = image
                    }
                }
//                const videoPromise = getVideoDevice("") // 
                const audioPromise = getAudioDevice("")
//                Promise.all([videoPromise, audioPromise]).then(()=>{
                Promise.all([audioPromise]).then(()=>{
                }).catch(err=>{
                    console.log(err)
                }).finally(()=>{
                    const deviceListPromise = getDeviceLists()

                    Promise.all([deviceListPromise]).then(([deviceList]) => {

                        const audioInputDevices = deviceList['audioinput']
                        const videoInputDevices = deviceList['videoinput']
                        const audioOutputDevices = deviceList['audiooutput']
                        this.setState({stamps:stamps})
    
                        const currentSettings = this.state.currentSettings
                        currentSettings.selectedInputAudioDevice = audioInputDevices![0] ? audioInputDevices![0]['deviceId'] : NO_DEVICE_SELECTED
                        currentSettings.selectedInputVideoDevice = videoInputDevices![0] ? videoInputDevices![0]['deviceId'] : NO_DEVICE_SELECTED
                        currentSettings.selectedOutputAudioDevice = audioOutputDevices![0] ? audioOutputDevices![0]['deviceId'] : NO_DEVICE_SELECTED

                        console.log("device list", deviceList)
                        currentSettings.videoEnable = currentSettings.selectedInputVideoDevice===NO_DEVICE_SELECTED ? false:true

                        this.setState({currentSettings:currentSettings})
                        try{
                            this.state.localVideoEffectors.selectInputVideoDevice(currentSettings.selectedInputVideoDevice)
                        }catch(e){
                            console.log("error: ", e)
                        }
                        props.lobbyPrepared(audioInputDevices, videoInputDevices, audioOutputDevices)
                        props.refreshRoomList()
                    })

                })
                return (
                    <div />
                )
            } else {
                return (
                    <div>
                        <Lobby  {...props} appState={this.state} />
                    </div>
                )
            }
        }

        /**
         * Meeting Setup
         */
        if (gs.status === AppStatus.IN_MEETING) {
            if (gs.meetingStatus === AppMeetingStatus.WILL_PREPARE && this.state.joinedMeetings[gs.preparingMeetingId!]===undefined) {
                // If session exist already, it'll be initialized.
                const meetingSessionConf = new MeetingSessionConfiguration(gs.joinInfos[gs.preparingMeetingId!].Meeting, gs.joinInfos[gs.preparingMeetingId!].Attendee)
                const defaultMeetingSession = initializeMeetingSession(gs, meetingSessionConf)
                const meetingId = defaultMeetingSession.configuration.meetingId!
                registerHandlers(this, props, defaultMeetingSession)
                // const url = new URL(window.location.href);
                // url.searchParams.set('m', gs.roomTitle);
                // window.history.replaceState({}, `${gs.roomTitle}`, url.toString());

                const messagingSocket = new WebsocketApps(
                    defaultMeetingSession.configuration.meetingId!,
                    defaultMeetingSession.configuration.credentials!.attendeeId!,
                    defaultMeetingSession.configuration.credentials!.joinToken!
                )
                const messagingSocketPromise = messagingSocket.open()

                const mediaStream = this.state.localVideoEffectors.getMediaStream()
                console.log("MS", mediaStream)
                const auidoInputPromise  = defaultMeetingSession.audioVideo.chooseAudioInputDevice(this.state.currentSettings.selectedInputAudioDevice)
                const auidooutputPromise = defaultMeetingSession.audioVideo.chooseAudioOutputDevice(this.state.currentSettings.selectedOutputAudioDevice)
                const videoConfig = LocalVideoConfigs[this.state.currentSettings.selectedInputVideoResolution]
                defaultMeetingSession.audioVideo.chooseVideoInputQuality(videoConfig.width, videoConfig.height, videoConfig.frameRate, videoConfig.maxBandwidthKbps);

                let videoInputPromise = null
                if(this.state.currentSettings.videoEnable){
                    videoInputPromise  = defaultMeetingSession.audioVideo.chooseVideoInputDevice(mediaStream)
                }else{
                    videoInputPromise  = defaultMeetingSession.audioVideo.chooseVideoInputDevice(null)
                }
                const outputAudioElement = document.createElement("audio")


                Promise.all([auidoInputPromise, auidooutputPromise, videoInputPromise, messagingSocketPromise]).then(() => {
                    // Initializing for meeting
                    defaultMeetingSession.audioVideo.bindAudioElement(outputAudioElement!)
                    defaultMeetingSession.audioVideo.start()
                    if (this.state.currentSettings.mute) {
                        defaultMeetingSession.audioVideo.realtimeMuteLocalAudio();
                    } else {
                        defaultMeetingSession.audioVideo.realtimeUnmuteLocalAudio();
                    }
                    if (this.state.currentSettings.speakerEnable) {
                        defaultMeetingSession.audioVideo.bindAudioElement(outputAudioElement!)
                    } else {
                        defaultMeetingSession.audioVideo.unbindAudioElement();
                    }
                    defaultMeetingSession.audioVideo.startLocalVideoTile()

                    // Set WebsocketApps Event
                    messagingSocket.addFileRecievingEventListener((e:RecievingStatus)=>{
                        const joinedMeetings = this.state.joinedMeetings
                        joinedMeetings[meetingId].fileTransferStatus.recievingStatuses = getRecievingStatus()
                        this.setState({ joinedMeetings: joinedMeetings })
                        if(e.available===true){
                            saveFile(e.uuid)
                        }
                        console.log(`File Recieving...: ${e.recievedIndex}/${e.partNum}`)

                    })
                    messagingSocket.addFileSendingEventListener((e:SendingStatus)=>{
                        console.log(`File Transfering...: ${e.transferredIndex}/${e.partNum}`)
                        const joinedMeetings = this.state.joinedMeetings
                        joinedMeetings[meetingId].fileTransferStatus.sendingStatusStatuses = getSendingStatus()
                        this.setState({ joinedMeetings: joinedMeetings })
                    })
                    messagingSocket.addStampEventListener((e:WSStamp)=>{
                        this.state.joinedMeetings[meetingId].globalStamps.push(e)
                    })
                    messagingSocket.addTextEventListener((e:WSText)=>{
                        this.state.joinedMeetings[meetingId].globalStamps.push(e)
                    })

                    const joinedMeetings = this.state.joinedMeetings
                    joinedMeetings[meetingId] = {
                        roster: {},
                        videoTileStates: {},
                        fileTransferStatus: {
                            sendingStatusStatuses  : [],
                            recievingStatuses      : [],
                        },
                        globalStamps: [],
                        focusAttendeeId: NO_FOCUSED,
                        messagingSocket: messagingSocket,
                        meetingSessionConfiguration: meetingSessionConf,
                        meetingSession: defaultMeetingSession,
                        outputAudioElement: outputAudioElement,

                    }
                    this.setState({joinedMeetings:joinedMeetings})
                    props.meetingPrepared()
                })
                return <div />
            }

            if (gs.meetingStatus !== AppMeetingStatus.WILL_PREPARE){
                Object.keys(this.state.joinedMeetings).forEach((meetingId:string)=>{
                    Object.keys(this.state.joinedMeetings[meetingId].roster).forEach((attendeeId:string)=>{
                        if(gs.storeRosters[meetingId] !== undefined &&attendeeId in gs.storeRosters[meetingId]){
                            const attendee = this.state.joinedMeetings[meetingId].roster[attendeeId]
                            attendee.name = gs.storeRosters[meetingId][attendeeId].name
                        }
                    })
                })
                return (
                    <div>
                        <Lobby  {...props} appState={this.state} />
                    </div>
                )
    
            }
        }
        return <div />
    }
}


export default App;