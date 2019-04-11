import React, { Component } from 'react';
import logo from './logo.svg';
import './App.css';
import dopeArrow from './img/36-like-sm-bw-dn2.png'
import wotArrow from './img/36-wot-sm-bw-cn.png'

class App extends Component {
  render() {
    return (
      <div class="arrows">
        <img src={dopeArrow}></img>
        <img src={wotArrow}></img>
      </div>
    )
  }
}

export default App;
