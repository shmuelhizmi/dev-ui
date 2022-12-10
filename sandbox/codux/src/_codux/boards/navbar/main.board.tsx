import { createBoard } from '@wixc3/react-board';
import { Navbar } from '../../../components/navbar/navbar';
import Navbar_module from '../../../components/navbar/navbar.module.scss';

export default createBoard({
    name: 'Main',
    Board: () => <Navbar className={Navbar_module.root} username="shmuel"></Navbar>,
    environmentProps: {
        canvasWidth: 566,
        canvasHeight: 870
    }
});
