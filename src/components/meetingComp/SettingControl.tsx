import * as React from 'react';
import { Icon, Button, Modal, Grid, List } from 'semantic-ui-react';
import { RS_VBG } from '../resources';
import { AppState } from '../App';

// const trigger = (
//     // <div as="a">
//     //   <Icon name="setting" />other setting
//     // </div>
//     <List link>
//         <List.Item as='a' active onClick={() => { this.settingOpen() }}><Icon name="setting"  active />Virtual Background</List.Item>
//     </List>
//   )

interface SettingControlState {
    open: boolean,
}

class SettingControl extends React.Component {
    
    state: SettingControlState ={
        open: false,
    }
    settingOpen = () => {
        this.setState({ open: true })
    }
    settingClose = () => {
        this.setState({open: false})
    }
    
    generateSettingModal = () => {
        return (
            <Modal onClose={this.settingClose} open={this.state.open}>
            <Modal.Header>Setting</Modal.Header>
            <Modal.Content>
                <Grid>
                <Grid.Row>
                    Virtual background
                    </Grid.Row>
                <Grid.Row>
                    {this.generateVGSettingPanal()}
                </Grid.Row>
                </Grid>
            </Modal.Content>
            <Button content='Close' negative onClick={this.settingClose} />
            </Modal>
        )
    }
    
    generateVGSettingPanal = () => {
        const props = this.props as any
        const appState = props.appState as AppState

        const images = []
        RS_VBG.sort()
        for (const i in RS_VBG) {
            const imgPath = RS_VBG[i]
            images.push(
            <Grid.Column width={4}>
                <div onClick={() => { props.setVirtualBackground(imgPath) }} style={
                (() => {
                    return appState.localVideoEffectors.virtualBackgroundImagePath === imgPath ?
                    { color: "red", border: "2px solid #ff0000", width: "100%", height: "100%" } :
                    { width: "100%", height: "100%" }
                })()
                }>
                <img src={imgPath} width="100%" height="100%" alt="" />
                </div>
            </Grid.Column>
            )
        }
        return (
            images
        )
    }

    select = (value:string) =>{
        if(value==="virtual background"){
            this.settingOpen()
        }
        console.log(value)
    }

    render() {
        return (
          // @ts-ignore
          <div>
            <List link>
                <List.Item as='a' active onClick={() => { this.settingOpen() }}><Icon name="setting"  active />Virtual Background</List.Item>
            </List>

            {this.generateSettingModal()}
          </div>
        )
    }
}

export default SettingControl;


