const express = require('express');
const exphbs = require('express-handlebars');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
const session = require('express-session');
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser');
const app = express();
const port = 3000;
app.use(cookieParser());
app.use(express.urlencoded({ extended: false }));

function generarToken(usuario) {
  const payload = {
    userId: usuario.id,
    sessionId: usuario.sessionId,
  };
  const token = jwt.sign(payload, 'secreto', { expiresIn: '1h' });
  return token;
}
function verificarToken(req, res, next) {
  const token = req.cookies.token;
  if (!token) {
    console.log('No posee cookie de autenticación');
    return;
  }
  jwt.verify(token, 'secreto', (err, decoded) => {
    if (err) {
      console.log('Cookie de autenticación inválida');
      return;
    }

    req.user = decoded;
    req.session.emailSesion = req.user.email;
    next();
  });
}

app.listen(port, () => {
  console.log(`Servidor en funcionamiento en http://localhost:${port}`);
});

// Definir el esquema del usuario
const userSchema = new mongoose.Schema({
  name: String,
  email: String,
  password: String,
  monto: Number,
  tarjeta: String,
  historial: [{
    date: Date,
    amount: Number,
    comment: String
  }]
});

// Crear el modelo de usuario
const User = mongoose.model('User', userSchema);

// Conectar a la base de datos de MongoDB
mongoose.connect('mongodb+srv://nicolasfernandez3:sDIgB1T8esNDwMAm@dweb.gp4z7sq.mongodb.net/tarea3', { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => {
    console.log('Conexión exitosa a la base de datos');
  })
  .catch((error) => {
    console.error('Error al conectar a la base de datos:', error);
  });

app.get('/', (req, res) => {

res.render('/usuario')

});
app.get('/usuario', verificarToken, (req, res) => {
  // Verificar si hay un usuario autenticado
  if (!req.user) {
    // No hay usuario autenticado, retornar false
    res.json(false);
    return;
  }

  // Obtener la información del usuario autenticado
  const { name, email } = req.user;

  // Retornar la información del usuario
  res.json({
    name: name,
    email: email
  });
});
app.post('/usuario', (req, res) => {
  // Obtener los datos del nuevo usuario desde el cuerpo de la solicitud
  const { name, email, password } = req.body;

  // Verificar si faltan datos requeridos
  if (!name || !email || !password) {
    res.json(false);
    return;
  }

  // Verificar si el usuario ya existe en la base de datos
  User.findOne({ email: email })
    .then((existingUser) => {
      if (existingUser) {
        // El usuario ya existe, retornar false
        res.json(false);
      } else {
        // Crear un nuevo usuario en la base de datos
        const newUser = new User({
          name: name,
          email: email,
          password: password
        });

        // Generar un token para el nuevo usuario
        const token = generarToken(newUser);

        // Guardar el token en una cookie
        res.cookie('token', token);

        // Guardar el usuario en la base de datos
        newUser.save()
          .then(() => {
            res.json(true);
          })
          .catch((error) => {
            console.error('Error al crear el nuevo usuario:', error);
            res.json(false);
          });
      }
    })
    .catch((error) => {
      console.error('Error al buscar el usuario en la base de datos:', error);
      res.json(false);
    });
});
app.post('/ingresar', (req, res) => {
  // Obtener los datos de inicio de sesión desde el cuerpo de la solicitud
  const { email, password } = req.body;

  // Verificar si faltan datos requeridos
  if (!email || !password) {
    return res.status(400).json({
			error: "Por favor, completa todos los campos.",
		});
  }

  // Verificar los datos de inicio de sesión del usuario en la base de datos
  User.findOne({ email: email, password: password })
    .then((user) => {
      if (user) {
        // Los datos de inicio de sesión son correctos, generar un token aleatorio para el usuario
        const token = generarToken(user);

        // Almacenar el token en una cookie
        res.cookie('token', token, { httpOnly: true });

        // Establecer la sesión de autenticación
        req.session.user = user;

        res.status(200).json({ usuario: usuario });
      } else {
        // Los datos de inicio de sesión son incorrectos, retornar false
        res.json(false);
      }
    })
    .catch((error) => {
      res.status(500).json({
        error: "Hubo un problema al registrar el usuario.",
      });
    });
});




app.post('/transferir', verificarToken, (req, res) => {
  const { email, amount, comment } = req.body;

  // Verificar que los campos requeridos estén presentes
  if (!email || !amount || !comment) {
    return res.status(400).json({
      success: false,
      message: 'Faltan datos'
    });
  }

  // Buscar el usuario autenticado en la base de datos
  User.findOne({ email: req.user.email })
    .then((authUser) => {
      // Verificar que el usuario autenticado exista
      if (!authUser) {
        return res.status(400).json({
          success: false,
          message: 'Usuario autenticado no encontrado'
        });
      }

      // Buscar el usuario de destino en la base de datos
      User.findOne({ email: email })
        .then((destUser) => {
          // Verificar que el usuario de destino exista
          if (!destUser) {
            return res.status(400).json({
              success: false,
              message: 'Usuario de destino no encontrado'
            });
          }

          // Verificar que el usuario autenticado tenga suficiente monto
          if (authUser.monto < amount) {
            return res.status(400).json({
              success: false,
              message: 'Monto insuficiente'
            });
          }

          // Realizar la transferencia descontando el monto desde el usuario autenticado y sumándolo al usuario de destino
          authUser.monto -= amount;
          destUser.monto += amount;

          // Registrar la transferencia en el historial del usuario autenticado
          authUser.historial.push({
            date: new Date(),
            amount: -amount,
            comment: `Transferencia a ${email}`
          });

          // Registrar la transferencia en el historial del usuario de destino
          destUser.historial.push({
            date: new Date(),
            amount: amount,
            comment: `Transferencia recibida de ${authUser.email}`
          });

          // Guardar los cambios en la base de datos
          Promise.all([authUser.save(), destUser.save()])
            .then(() => {
              res.json({
                success: true,
                message: 'Transferencia realizada exitosamente'
              });
            })
            .catch((error) => {
              console.error('Error al guardar usuarios:', error);
              res.status(500).json({
                success: false,
                message: 'Error al realizar la transferencia'
              });
            });
        })
        .catch((error) => {
          console.error('Error al buscar usuario de destino:', error);
          res.status(500).json({
            success: false,
            message: 'Error al buscar usuario de destino'
          });
        });
    })
    .catch((error) => {
      console.error('Error al buscar usuario autenticado:', error);
      res.status(500).json({
        success: false,
        message: 'Error al buscar usuario autenticado'
      });
    });
});

app.get('/transferir', (req, res) => {
  User.find()
    .then((users) => {
      const transferencias = [];

      users.forEach((user) => {
        user.historial.forEach((transferencia) => {
          transferencias.push({
            id: transferencia.id,
            amount: transferencia.amount,
            email: user.email,
            comment: transferencia.comment
          });
        });
      });

      res.json({
        data: transferencias
      });
    })
    .catch((error) => {
      console.error('Error al buscar usuarios:', error);
      res.status(500).json({
        success: false,
        message: 'Error al obtener las transferencias'
      });
    });
});

app.post('/recargar', verificarToken, (req, res) => {
  const { amount, credit_card } = req.body;
  if (!amount || !credit_card) {
    return res.status(400).json({
      success: false,
      message: 'Faltan datos'
    });
  }

  // Buscar el usuario autenticado en la base de datos
  User.findOne({ email: req.user.email })
    .then((authUser) => {
      // Verificar que el usuario autenticado exista
      if (!authUser) {
        return res.status(400).json({
          success: false,
          message: 'Usuario autenticado no encontrado'
        });
      }

      // Realizar la recarga sumando el monto al usuario autenticado
      authUser.monto += amount;

      // Registrar la recarga en el historial del usuario autenticado
      authUser.historial.push({
        date: new Date(),
        amount: amount,
        comment: 'Recarga de saldo'
      });

      // Guardar los cambios en la base de datos
      authUser.save()
        .then(() => {
          res.json({
            success: true,
            message: 'Recarga realizada exitosamente'
          });
        })
        .catch((error) => {
          console.error('Error al guardar usuario:', error);
          res.status(500).json({
            success: false,
            message: 'Error al realizar la recarga'
          });
        });
    })
    .catch((error) => {
      console.error('Error al buscar usuario autenticado:', error);
      res.status(500).json({
        success: false,
        message: 'Error al buscar usuario autenticado'
      });
    });
});

app.post('/retirar', (req, res) => {
  const { amount, credit_card } = req.body;

  // Verificar que los campos requeridos estén presentes
  if (!amount || !credit_card) {
    return res.status(400).json({
      success: false,
      message: 'Faltan datos'
    });
  }

  // Buscar el usuario autenticado en la base de datos
  User.findOne({ email: req.user.email })
    .then((authUser) => {
      // Verificar que el usuario autenticado exista
      if (!authUser) {
        return res.status(400).json({
          success: false,
          message: 'Usuario autenticado no encontrado'
        });
      }

      // Verificar si el usuario tiene saldo igual o superior al monto a retirar
      if (authUser.monto < amount) {
        return res.status(400).json({
          success: false,
          message: 'Saldo insuficiente'
        });
      }

      // Realizar el retiro descontando el monto del usuario autenticado
      authUser.monto -= amount;

      // Registrar el retiro en el historial del usuario autenticado
      authUser.historial.push({
        date: new Date(),
        amount: amount,
        comment: 'Retiro de saldo'
      });

      // Guardar los cambios en la base de datos
      authUser.save()
        .then(() => {
          res.json({
            success: true,
            message: 'Retiro realizado exitosamente'
          });
        })
        .catch((error) => {
          console.error('Error al guardar usuario:', error);
          res.status(500).json({
            success: false,
            message: 'Error al realizar el retiro'
          });
        });
    })
    .catch((error) => {
      console.error('Error al buscar usuario autenticado:', error);
      res.status(500).json({
        success: false,
        message: 'Error al buscar usuario autenticado'
      });
    });
});

app.get('/salir', (req, res) => {
  // Eliminar la sesión
  req.session.destroy((error) => {
    if (error) {
      console.error('Error al eliminar la sesión:', error);
      res.status(500).json({
        success: false,
        message: 'Error al salir'
      });
    } else {
      // La sesión se eliminó correctamente
      res.json(true);
    }
  });
});
app.get('/movimientos', verificarToken, (req, res) => {
  // Buscar el usuario autenticado en la base de datos
  User.findOne({ email: req.user.email })
    .then((authUser) => {
      // Verificar si el usuario autenticado existe
      if (!authUser) {
        return res.json(false);
      }

      // Obtener los movimientos del usuario autenticado
      const movements = authUser.historial.map((movement) => ({
        id: movement.id,
        amount: movement.amount,
        email: authUser.email,
        comment: movement.comment
      }));

      // Verificar si hay movimientos registrados
      if (movements.length === 0) {
        return res.json(false);
      }

      // Devolver los movimientos
      res.json({
        movements: movements
      });
    })
    .catch((error) => {
      console.error('Error al buscar usuario autenticado:', error);
      res.status(500).json({
        success: false,
        message: 'Error al obtener los movimientos'
      });
    });
});