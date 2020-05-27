import * as React from 'react';
import { Accordion, Icon, Grid, Input, Form } from 'semantic-ui-react';
import { RS_STAMPS } from '../resources';
import { AppState } from '../App';

interface SendTextAccordionState{
    open             : boolean
    message          : string
}

class SendTextAccordion extends React.Component {
  state: SendTextAccordionState = {
    open             : false,
    message          : "",
  }

  handleClick() {
    this.setState({open: !this.state.open})
  }

  ////////////////////////////////
  /// Lifecycle
  ///////////////////////////////
  constructor(props:any) {
    super(props);
  }

  ////////////////////////////////
  /// UI
  ///////////////////////////////
  generateAccordion = () =>{
    const props = this.props as any
    const appState = props.appState as AppState

    const grid = (
        <Accordion styled>
        <Accordion.Title
            active={this.state.open}
            index={0}
            onClick={()=>{this.handleClick()}}
        >
            <Icon name='dropdown' />
            SendText
        </Accordion.Title>
        <Accordion.Content active={this.state.open}>
          <Form onSubmit={(e)=>{props.sendText( appState.currentSettings.focuseAttendeeId, this.state.message); this.setState({message: ""})}}>
            <Form.Input  placeholder='message' value={this.state.message} onChange={(e)=>{this.setState({message: e.target.value})}} />
          </Form>
        </Accordion.Content>
        </Accordion>
    )
    return grid
  }


  render() {
    return this.generateAccordion()
  }

}

export default SendTextAccordion;

