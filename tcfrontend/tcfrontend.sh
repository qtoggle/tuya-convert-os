#!/bin/bash

cd $(dirname $0)/..
PYTHONPATH=tcfrontend
python3 -m tcfrontend.main
