import * as Block from './block'
import * as NodeApi from './node-api'

/**
 * Interaction between a node and a set of remote nodes
 * 
 * remote nodes can be added with the addRemoteNode function
 * they can be removed with the removeRemoteNode function
 */
export class NodeTransfer {
    private listeners: any[] = undefined
    private knownNodes: NodeApi.NodeApi[] = undefined

    constructor(
        public node: NodeApi.NodeApi
    ) {
    }

    initialize(knownNodes: NodeApi.NodeApi[]) {
        this.listeners = []
        this.knownNodes = []

        knownNodes.forEach(node => this.initRemoteNode(node))
    }

    getKnownNodes() {
        return this.knownNodes
    }

    addRemoteNode(remoteNode: NodeApi.NodeApi) {
        console.log(`addRemoteNode ${remoteNode.name}`)
        this.initRemoteNode(remoteNode)
    }

    removeRemoteNode(remoteNode: NodeApi.NodeApi) {
        let index = this.knownNodes.indexOf(remoteNode)
        if (index < 0)
            return

        console.log(`removeRemoteNode ${remoteNode.name}`)

        remoteNode.removeEventListener(this.listeners[index])
        this.listeners.splice(index, 1)
        this.knownNodes.splice(index, 1)
    }

    terminate() {
        this.knownNodes.forEach((remoteNode, index) => remoteNode.removeEventListener(this.listeners[index]))
        this.listeners = undefined
        this.node = undefined
        this.knownNodes = undefined
    }

    private initRemoteNode(remoteNode: NodeApi.NodeApi) {
        this.knownNodes.push(remoteNode)

        let listener = (branch: string) => {
            console.log(`[${this.node.name}] receive branch ${branch} change from ${remoteNode.name}`)
            try {
                this.fetchFromNode(remoteNode, branch)
            }
            catch (err) {
                console.log(`error when fetchAllBranchesFromNode for node ${remoteNode.name}: ${err}`)
            }
        }

        remoteNode.addEventListener('head', listener)

        this.listeners.push(listener)

        this.fetchAllBranchesFromNode(remoteNode)
    }

    private async fetchAllBranchesFromNode(remoteNode: NodeApi.NodeApi) {
        try {
            let branches = await remoteNode.branches()
            if (!branches) {
                console.log(`empty branch set, nothing to do...`)
                return
            }
            for (let branch of branches) {
                try {
                    await this.fetchFromNode(remoteNode, branch)
                }
                catch (err) {
                    console.log(`error when fetchAllBranchesFromNode for node ${remoteNode.name}: ${err}`)
                }
            }
        }
        catch (err) {
            console.log(`error when fetchAllBranchesFromNode for node ${remoteNode.name}: ${err}`)
        }
    }

    // list of blocks to load (id + remotes)

    // load when all parents are in the node

    private async fetchFromNode(remoteNode: NodeApi.NodeApi, branch: string) {
        let remoteHead = await remoteNode.blockChainHead(branch)

        // TODO : do it by batches
        // TODO : have a global context to do that

        // fetch the missing parent blocks in node
        let toAddBlocks: { id: string, block: Block.Block }[] = []
        let fetchList = [remoteHead]
        while (fetchList.length) {
            let toMaybeFetch = fetchList.shift()

            if (await this.node.knowsBlock(toMaybeFetch))
                continue

            let addedBlocks = await remoteNode.blockChainBlockData(toMaybeFetch, 10)
            if (addedBlocks) {
                for (let addedBlock of addedBlocks) {
                    let addedBlockId = await Block.idOfBlock(addedBlock)

                    if (!toAddBlocks.find(b => b.id == addedBlockId))
                        toAddBlocks.push({ id: addedBlockId, block: addedBlock })

                    addedBlock.previousBlockIds && addedBlock.previousBlockIds.forEach(previousBlockId => fetchList.push(previousBlockId))
                }
            }
        }

        // add them to node
        toAddBlocks = toAddBlocks.reverse()
        for (let toAddBlock of toAddBlocks) {
            console.log(`transfer block ${toAddBlock.id.substring(0, 5)} from ${remoteNode.name} to ${this.node.name}`)
            await this.node.registerBlock(toAddBlock.block)
        }
    }
}